import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

import { InputError } from "../api.ts"
import { latestSnapshot } from "../assets/repo.ts"
import { getBgmTrack } from "../audio/bgm-repo.ts"
import {
  getGeneratedAsset,
  listGeneratedAssets,
  listGenerationTasks,
} from "../generation/repo.ts"
import { inspectTimelineDialogue } from "../video/render-plan.ts"
import {
  TIMELINE_DURATION_TOLERANCE_MS,
  buildInitialTimeline,
} from "./initial.ts"
import type { TimelineDraft, TimelinePayload, TimelineVersion } from "./types.ts"

interface DraftRow {
  id: string
  project_id: string
  episode: number
  revision: number
  payload_json: string
  created_at: number
  updated_at: number
}

interface VersionRow {
  id: string
  project_id: string
  episode: number
  revision: number
  payload_json: string
  input_hashes_json: string
  created_at: number
}

export class TimelineConflictError extends Error {
  // errorResponse 识别 status，把多页面同时编辑稳定映射成 409。
  readonly status = 409

  constructor(message: string) {
    super(message)
    this.name = "TimelineConflictError"
  }
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function readJson(value: string): Record<string, unknown> {
  try {
    return object(JSON.parse(value) as unknown)
  } catch {
    return {}
  }
}

function integer(value: unknown, fallback = 0): number {
  const number = Math.floor(Number(value))
  return Number.isFinite(number) ? number : fallback
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeEpisode(value: unknown): number {
  const episode = integer(value, -1)
  if (episode < 0 || episode > 9999) throw new InputError("集号不正确")
  return episode
}

function toDraft(row: DraftRow): TimelineDraft {
  return {
    id: row.id,
    projectId: row.project_id,
    episode: row.episode,
    revision: row.revision,
    payload: readJson(row.payload_json) as unknown as TimelinePayload,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toVersion(row: VersionRow): TimelineVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    episode: row.episode,
    revision: row.revision,
    payload: readJson(row.payload_json) as unknown as TimelinePayload,
    inputHashes: Object.fromEntries(
      Object.entries(readJson(row.input_hashes_json))
        .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    ),
    createdAt: row.created_at,
  }
}

function validatePayload(
  db: DatabaseSync,
  projectId: string,
  episode: number,
  input: unknown,
  current: TimelinePayload,
): TimelinePayload {
  // 客户端的计数和总时长不可信，保存时按片段重新计算，并校验素材确属该镜头。
  const payload = object(input)
  if (integer(payload.schemaVersion) !== 1) throw new InputError("时间线格式版本不支持")
  if (text(payload.projectId) !== projectId) throw new InputError("时间线项目不匹配")
  if (normalizeEpisode(payload.episode) !== episode) throw new InputError("时间线集号不匹配")
  if (!Array.isArray(payload.clips)) throw new InputError("时间线缺少镜头片段")
  if (payload.clips.length > 500) throw new InputError("单集时间线不能超过 500 个片段")

  const seenClipIds = new Set<string>()
  const seenShotIds = new Set<string>()
  const currentByShot = new Map(current.clips.map((clip) => [clip.shotId, clip]))
  const clips = payload.clips.map((raw, index) => {
    const clip = object(raw)
    const id = text(clip.id)
    const shotId = text(clip.shotId)
    if (!id || !shotId) throw new InputError(`第 ${index + 1} 个时间线片段缺少稳定 id`)
    if (seenClipIds.has(id)) throw new InputError("时间线片段 id 重复")
    if (seenShotIds.has(shotId)) throw new InputError("同一镜头不能在时间线中重复")
    seenClipIds.add(id)
    seenShotIds.add(shotId)
    const stable = currentByShot.get(shotId)
    if (!stable) throw new InputError("草稿不能通过重排接口增删镜头")
    const sourceAssetId = text(clip.sourceAssetId) || null
    let sourceDurationMs: number | null = null
    if (sourceAssetId) {
      const asset = getGeneratedAsset(db, sourceAssetId, projectId)
      if (
        !asset
        || (asset.mediaKind ?? "image") !== "video"
        || asset.targetType !== "shot"
        || asset.targetId !== shotId
      ) {
        throw new InputError("时间线引用了无效的视频素材")
      }
      sourceDurationMs = asset.durationMs && asset.durationMs > 0
        ? Math.round(asset.durationMs)
        : null
    }
    const status = !sourceAssetId
      ? "missing-video"
      : sourceDurationMs === null
        ? "missing-duration"
        : Math.abs(sourceDurationMs - stable.expectedDurationMs) > TIMELINE_DURATION_TOLERANCE_MS
          ? "duration-mismatch"
          : "ready"
    let inMs = 0
    let outMs = stable.expectedDurationMs
    let durationMs = stable.expectedDurationMs
    if (sourceDurationMs !== null) {
      inMs = Math.max(0, integer(clip.inMs))
      outMs = Math.max(0, integer(clip.outMs, sourceDurationMs))
      durationMs = sourceDurationMs
      if (outMs > sourceDurationMs || inMs >= outMs || outMs - inMs < 500) {
        throw new InputError(
          `第 ${stable.shotNumber} 镜裁剪范围必须在 0-${(sourceDurationMs / 1000).toFixed(2)} 秒内，且至少保留 0.50 秒`,
        )
      }
    }
    const reason = status === "missing-video"
      ? "这一镜还没有已采用视频"
      : status === "missing-duration"
        ? "视频缺少可读取的时长"
        : status === "duration-mismatch"
          ? `视频 ${(sourceDurationMs! / 1000).toFixed(2)}s 与分镜 ${(stable.expectedDurationMs / 1000).toFixed(2)}s 不一致`
          : null
    return {
      id: stable.id,
      shotId,
      shotNumber: stable.shotNumber,
      scene: stable.scene,
      speaker: stable.speaker,
      dialogue: stable.dialogue,
      sourceAssetId,
      sourceDurationMs,
      durationMs,
      expectedDurationMs: stable.expectedDurationMs,
      inMs,
      outMs,
      muted: clip.muted === true,
      volume: Math.max(0, Math.min(1, Number(clip.volume) || 0)),
      status: status as TimelinePayload["clips"][number]["status"],
      reason,
    }
  })
  const readyCount = clips.filter((clip) => clip.status === "ready").length
  const audio = object(payload.audio)
  const subtitle = object(payload.subtitle)
  const video = object(payload.video)
  const bgmAssetId = text(audio.bgmAssetId) || null
  const bgmFadeInMs = Math.max(0, Math.min(5_000, Number(audio.bgmFadeInMs) || 600))
  const bgmFadeOutMs = Math.max(0, Math.min(5_000, Number(audio.bgmFadeOutMs) || 1_000))
  // BGM 必须来自当前项目曲库，时间线不能引用其他项目或任意路径。
  if (bgmAssetId && !getBgmTrack(db, projectId, bgmAssetId)) {
    throw new InputError("时间线引用了无效的 BGM")
  }
  return {
    schemaVersion: 1,
    projectId,
    episode,
    fps: 30,
    clips,
    readyCount,
    blockedCount: clips.length - readyCount,
    totalDurationMs: clips.reduce((sum, clip) => sum + Math.max(0, clip.outMs - clip.inMs), 0),
    subtitle: {
      enabled: true,
      style: subtitle.style === "cinematic" || subtitle.style === "bold"
        ? subtitle.style
        : "clean",
    },
    video: {
      transition: video.transition === "cut" ? "cut" : "fade",
      transitionDurationMs: Math.max(
        0,
        Math.min(1_000, Number(video.transitionDurationMs) || 200),
      ),
    },
    audio: {
      dialogueVolume: 1,
      bgmAssetId,
      bgmVolume: Math.max(0, Math.min(1, Number(audio.bgmVolume) || 0.3)),
      bgmFadeInMs,
      bgmFadeOutMs,
      bgmDucking: audio.bgmDucking !== false,
    },
  }
}

export function initializeEpisodeTimeline(
  db: DatabaseSync,
  projectId: string,
  rawEpisode: number,
): { draft: TimelineDraft; created: boolean } {
  const episode = normalizeEpisode(rawEpisode)
  const existing = getTimelineDraft(db, projectId, episode)
  if (existing) return { draft: existing, created: false }
  const snapshot = latestSnapshot(db, projectId, "shots")
  if (!snapshot || !Array.isArray(snapshot.payload)) {
    throw new InputError("还没有分镜，不能生成时间线")
  }
  const built = buildInitialTimeline({
    projectId,
    episode,
    shots: snapshot.payload,
    videos: listGeneratedAssets(db, projectId, undefined, undefined, "video"),
  })
  if (built.payload.clips.length === 0) {
    throw new InputError(episode === 0 ? "没有未标注集的分镜" : `第 ${episode} 集还没有分镜`)
  }
  const id = randomUUID()
  const now = Date.now()
  db.prepare(
    `INSERT INTO timeline_drafts
      (id, project_id, episode, revision, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
  ).run(id, projectId, episode, JSON.stringify(built.payload), now, now)
  return { draft: getTimelineDraft(db, projectId, episode)!, created: true }
}

export function saveTimelineDraft(
  db: DatabaseSync,
  projectId: string,
  rawEpisode: number,
  expectedRevision: number,
  payload: TimelinePayload,
): TimelineDraft {
  const episode = normalizeEpisode(rawEpisode)
  const current = getTimelineDraft(db, projectId, episode)
  if (!current) throw new InputError("请先生成这一集的时间线草稿")
  if (current.revision !== expectedRevision) {
    throw new TimelineConflictError("时间线已在其他页面更新，请刷新后再改")
  }
  const normalized = validatePayload(db, projectId, episode, payload, current.payload)
  // 当前版本只开放重排和静音，不允许借保存草稿增删镜头。
  const currentShotIds = current.payload.clips.map((clip) => clip.shotId).sort()
  const nextShotIds = normalized.clips.map((clip) => clip.shotId).sort()
  if (
    currentShotIds.length !== nextShotIds.length
    || currentShotIds.some((shotId, index) => shotId !== nextShotIds[index])
  ) {
    throw new InputError("草稿不能通过重排接口增删镜头")
  }
  const now = Date.now()
  db.prepare(
    `UPDATE timeline_drafts
     SET revision = ?, payload_json = ?, updated_at = ?
     WHERE id = ? AND revision = ?`,
  ).run(current.revision + 1, JSON.stringify(normalized), now, current.id, current.revision)
  return getTimelineDraft(db, projectId, episode)!
}

export function freezeTimelineVersion(
  db: DatabaseSync,
  projectId: string,
  rawEpisode: number,
  expectedRevision: number,
): TimelineVersion {
  const episode = normalizeEpisode(rawEpisode)
  const draft = getTimelineDraft(db, projectId, episode)
  if (!draft) throw new InputError("请先生成这一集的时间线草稿")
  if (draft.revision !== expectedRevision) {
    throw new TimelineConflictError("时间线已在其他页面更新，请刷新后再固化版本")
  }
  const existing = db.prepare(
    "SELECT * FROM timeline_versions WHERE project_id = ? AND episode = ? AND revision = ?",
  ).get(projectId, episode, draft.revision) as VersionRow | undefined
  if (existing) return toVersion(existing)

  // 固化的是当前草稿的完整快照和素材指纹；之后采用新视频不会改写旧版本。
  const inputHashes: Record<string, string> = {}
  for (const clip of draft.payload.clips) {
    if (!clip.sourceAssetId) continue
    const asset = getGeneratedAsset(db, clip.sourceAssetId, projectId)
    if (!asset || (asset.mediaKind ?? "image") !== "video") {
      throw new InputError("时间线引用的视频素材不存在或无权访问")
    }
    if (!asset.sha256) throw new InputError("视频缺少文件指纹，不能固化为可渲染版本")
    inputHashes[asset.id] = asset.sha256
  }
  // 对白绑定也属于版本输入：没有 TTS 的镜头写入 missing 标记，
  // 之后补生成音频不会悄悄改变旧版本，必须重新固化一版。
  const shotSnapshot = latestSnapshot(db, projectId, "shots")
  const shots = shotSnapshot && Array.isArray(shotSnapshot.payload)
    ? shotSnapshot.payload
    : []
  const audioInspection = inspectTimelineDialogue({
    timeline: draft.payload,
    shots,
    tasks: listGenerationTasks(db, projectId, undefined, undefined, "audio"),
    assets: listGeneratedAssets(db, projectId, undefined, undefined, "audio"),
  })
  for (const line of audioInspection.lines) {
    if (line.muted) continue
    if (!line.assetId) {
      inputHashes[`tts:${line.shotId}:missing`] = "missing"
      continue
    }
    const audio = getGeneratedAsset(db, line.assetId, projectId)
    if (audio?.sha256) {
      inputHashes[`tts:${line.shotId}:${audio.id}`] = audio.sha256
    }
  }
  if (draft.payload.audio.bgmAssetId) {
    const bgm = getBgmTrack(db, projectId, draft.payload.audio.bgmAssetId)
    if (bgm) inputHashes[`bgm:${bgm.id}`] = bgm.sha256
  }
  const id = randomUUID()
  db.prepare(
    `INSERT INTO timeline_versions
      (id, project_id, episode, revision, payload_json, input_hashes_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    projectId,
    episode,
    draft.revision,
    JSON.stringify(draft.payload),
    JSON.stringify(inputHashes),
    Date.now(),
  )
  const row = db.prepare("SELECT * FROM timeline_versions WHERE id = ?").get(id) as VersionRow
  return toVersion(row)
}

export function getTimelineDraft(
  db: DatabaseSync,
  projectId: string,
  rawEpisode: number,
): TimelineDraft | null {
  const episode = normalizeEpisode(rawEpisode)
  const row = db.prepare(
    "SELECT * FROM timeline_drafts WHERE project_id = ? AND episode = ?",
  ).get(projectId, episode) as DraftRow | undefined
  return row ? toDraft(row) : null
}

export function listTimelineVersions(
  db: DatabaseSync,
  projectId: string,
  rawEpisode: number,
): TimelineVersion[] {
  const episode = normalizeEpisode(rawEpisode)
  const rows = db.prepare(
    "SELECT * FROM timeline_versions WHERE project_id = ? AND episode = ? ORDER BY revision DESC",
  ).all(projectId, episode) as VersionRow[]
  return rows.map(toVersion)
}

export function listLatestTimelineVersions(
  db: DatabaseSync,
  projectId: string,
): TimelineVersion[] {
  // 每个集只取最新固化版本；批量排队不会因为历史版本重复入队。
  const rows = db.prepare(
    `SELECT versions.*
     FROM timeline_versions versions
     JOIN (
       SELECT episode, MAX(revision) AS revision
       FROM timeline_versions
       WHERE project_id = ?
       GROUP BY episode
     ) latest
       ON latest.episode = versions.episode
      AND latest.revision = versions.revision
     WHERE versions.project_id = ?
     ORDER BY versions.episode ASC`,
  ).all(projectId, projectId) as VersionRow[]
  return rows.map(toVersion)
}

export function getTimelineVersion(
  db: DatabaseSync,
  projectId: string,
  id: string,
): TimelineVersion | null {
  const row = db.prepare(
    "SELECT * FROM timeline_versions WHERE id = ? AND project_id = ?",
  ).get(id, projectId) as VersionRow | undefined
  return row ? toVersion(row) : null
}
