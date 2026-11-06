import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { requireNovelPreset } from "./presets.ts"
import type {
  NovelChapterRecord,
  NovelEditionRecord,
  NovelPlan,
  NovelPresetId,
  NovelRunRecord,
  NovelVolumeRecord,
} from "./types.ts"

interface EditionRow {
  id: string
  project_id: string
  owner_id: string
  title: string
  preset: string
  status: string
  target_words_min: number
  target_words_max: number
  planned_chapters: number
  completed_chapters: number
  source_snapshot_ids_json: string
  source_signature: string
  current_run_id: string | null
  created_at: number
  updated_at: number
}

interface VolumeRow {
  id: string
  novel_id: string
  title: string
  summary: string
  start_chapter: number
  end_chapter: number
  order_index: number
}

interface ChapterRow {
  id: string
  novel_id: string
  volume_id: string | null
  number: number
  title: string
  outline: string
  hook: string
  content: string
  summary: string
  target_words: number
  word_count: number
  source_episode: number
  source_scene_ids_json: string
  source_signature: string
  status: string
  revision: number
  generated_at: number | null
  updated_at: number
}

interface RunRow {
  id: string
  novel_id: string
  project_id: string
  owner_id: string
  status: string
  cursor: number
  total: number
  completed: number
  budget_units: number
  used_units: number
  idempotency_key: string
  error: string | null
  started_at: number | null
  finished_at: number | null
  updated_at: number
}

function jsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(value as string)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
  } catch {
    return []
  }
}

function editionRow(row: EditionRow): NovelEditionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    title: row.title,
    preset: row.preset as NovelPresetId,
    status: row.status as NovelEditionRecord["status"],
    targetWordsMin: Number(row.target_words_min),
    targetWordsMax: Number(row.target_words_max),
    plannedChapters: Number(row.planned_chapters),
    completedChapters: Number(row.completed_chapters),
    sourceSnapshotIds: jsonArray(row.source_snapshot_ids_json),
    sourceSignature: row.source_signature,
    currentRunId: row.current_run_id,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function volumeRow(row: VolumeRow): NovelVolumeRecord {
  return {
    id: row.id,
    novelId: row.novel_id,
    title: row.title,
    summary: row.summary,
    startChapter: Number(row.start_chapter),
    endChapter: Number(row.end_chapter),
    orderIndex: Number(row.order_index),
  }
}

function chapterRow(row: ChapterRow): NovelChapterRecord {
  return {
    id: row.id,
    novelId: row.novel_id,
    volumeId: row.volume_id,
    number: Number(row.number),
    title: row.title,
    outline: row.outline,
    hook: row.hook,
    content: row.content,
    summary: row.summary,
    targetWords: Number(row.target_words),
    wordCount: Number(row.word_count),
    sourceEpisode: Number(row.source_episode),
    sourceSceneIds: jsonArray(row.source_scene_ids_json),
    status: row.status as NovelChapterRecord["status"],
    revision: Number(row.revision),
    sourceSignature: row.source_signature,
    generatedAt: row.generated_at === null ? null : Number(row.generated_at),
    updatedAt: Number(row.updated_at),
  }
}

function runRow(row: RunRow): NovelRunRecord {
  return {
    id: row.id,
    novelId: row.novel_id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    status: row.status as NovelRunRecord["status"],
    cursor: Number(row.cursor),
    total: Number(row.total),
    completed: Number(row.completed),
    budgetUnits: Number(row.budget_units),
    usedUnits: Number(row.used_units),
    idempotencyKey: row.idempotency_key,
    error: row.error,
    startedAt: row.started_at === null ? null : Number(row.started_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    updatedAt: Number(row.updated_at),
  }
}

export function createNovelEdition(
  db: DatabaseSync,
  input: {
    projectId: string
    ownerId: string
    title: string
    preset: unknown
    sourceSnapshotIds?: string[]
    sourceSignature?: string
  },
  now = Date.now(),
): NovelEditionRecord {
  const preset = requireNovelPreset(input.preset)
  const id = `novel_${randomUUID()}`
  const title = input.title.trim().slice(0, 120) || "未命名小说稿"
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO novel_editions
        (id, project_id, owner_id, title, preset, status, target_words_min, target_words_max,
         planned_chapters, completed_chapters, source_snapshot_ids_json, source_signature,
         created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, 0, 0, ?, ?, ?, ?)`,
    ).run(
      id,
      input.projectId,
      input.ownerId,
      title,
      preset.id,
      preset.wordsMin,
      preset.wordsMax,
      JSON.stringify(input.sourceSnapshotIds ?? []),
      input.sourceSignature ?? "",
      now,
      now,
    )
    const link = db.prepare(
      `INSERT INTO novel_source_links
        (id, novel_id, source_kind, snapshot_id, version, signature, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    const sourceIds = input.sourceSnapshotIds ?? []
    sourceIds.forEach((snapshotId, index) => {
      const exists = db.prepare("SELECT 1 AS ok FROM snapshots WHERE id = ?").get(snapshotId)
      if (!exists) return
      link.run(`novel_source_${randomUUID()}`, id, `snapshot-${index + 1}`, snapshotId, 0, "", now)
    })
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return getNovelEdition(db, id)!
}

export function getNovelEdition(
  db: DatabaseSync,
  novelId: string,
  ownerId?: string,
): NovelEditionRecord | null {
  const row = ownerId
    ? db.prepare("SELECT * FROM novel_editions WHERE id = ? AND owner_id = ?").get(novelId, ownerId)
    : db.prepare("SELECT * FROM novel_editions WHERE id = ?").get(novelId)
  return row ? editionRow(row as EditionRow) : null
}

export function getNovelEditionForProject(
  db: DatabaseSync,
  novelId: string,
  projectId: string,
  ownerId: string,
): NovelEditionRecord | null {
  const row = db.prepare(
    "SELECT * FROM novel_editions WHERE id = ? AND project_id = ? AND owner_id = ?",
  ).get(novelId, projectId, ownerId)
  return row ? editionRow(row as EditionRow) : null
}

export function listNovelEditions(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
): NovelEditionRecord[] {
  return (db.prepare(
    "SELECT * FROM novel_editions WHERE project_id = ? AND owner_id = ? ORDER BY updated_at DESC",
  ).all(projectId, ownerId) as EditionRow[]).map(editionRow)
}

export function saveNovelPlan(
  db: DatabaseSync,
  novelId: string,
  plan: NovelPlan,
  now = Date.now(),
): { volumes: NovelVolumeRecord[]; chapters: NovelChapterRecord[] } {
  const edition = getNovelEdition(db, novelId)
  if (!edition) throw new Error("小说稿不存在")
  const generated = db.prepare(
    "SELECT COUNT(*) AS n FROM novel_chapters WHERE novel_id = ? AND status <> 'planned'",
  ).get(novelId) as { n: number }
  if (Number(generated.n) > 0) {
    const error = new Error("已有生成内容，不能直接覆盖目录；请新建一版小说稿") as Error & { status?: number }
    error.status = 409
    throw error
  }

  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare("DELETE FROM novel_arcs WHERE novel_id = ?").run(novelId)
    db.prepare("DELETE FROM novel_chapters WHERE novel_id = ?").run(novelId)
    db.prepare("DELETE FROM novel_volumes WHERE novel_id = ?").run(novelId)

    const volumes = plan.volumes.map((volume, index) => {
      const id = `novel_volume_${randomUUID()}`
      db.prepare(
        `INSERT INTO novel_volumes
          (id, novel_id, title, summary, start_chapter, end_chapter, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        novelId,
        volume.title,
        volume.summary,
        volume.startChapter,
        volume.endChapter,
        index,
      )
      const arcId = `novel_arc_${randomUUID()}`
      db.prepare(
        `INSERT INTO novel_arcs
          (id, novel_id, volume_id, title, summary, start_chapter, end_chapter, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        arcId,
        novelId,
        id,
        `${volume.title} · 主线`,
        volume.summary,
        volume.startChapter,
        volume.endChapter,
        index,
      )
      return {
        id,
        novelId,
        title: volume.title,
        summary: volume.summary,
        startChapter: volume.startChapter,
        endChapter: volume.endChapter,
        orderIndex: index,
      }
    })
    const arcByVolume = new Map(
      (db.prepare("SELECT id, volume_id FROM novel_arcs WHERE novel_id = ?").all(novelId) as Array<{
        id: string
        volume_id: string
      }>).map((row) => [row.volume_id, row.id]),
    )

    for (const chapter of plan.chapters) {
      const volume = volumes.find((item) =>
        chapter.number >= item.startChapter && chapter.number <= item.endChapter)
      if (!volume) throw new Error(`第 ${chapter.number} 章没有归属卷`)
      db.prepare(
        `INSERT INTO novel_chapters
          (id, novel_id, volume_id, arc_id, number, title, outline, hook, content, summary,
           target_words, word_count, source_episode, source_scene_ids_json,
           source_snapshot_ids_json, source_signature, status, revision, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, 0, ?, ?, ?, ?, 'planned', 0, ?)`,
      ).run(
        `novel_chapter_${randomUUID()}`,
        novelId,
        volume.id,
        arcByVolume.get(volume.id) ?? null,
        chapter.number,
        chapter.title,
        chapter.outline,
        chapter.hook,
        chapter.targetWords,
        chapter.sourceEpisode,
        JSON.stringify(chapter.sourceSceneIds),
        JSON.stringify(edition.sourceSnapshotIds),
        edition.sourceSignature,
        now,
      )
    }
    db.prepare(
      "UPDATE novel_editions SET status = 'planned', planned_chapters = ?, updated_at = ? WHERE id = ?",
    ).run(plan.chapters.length, now, novelId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return { volumes: listNovelVolumes(db, novelId), chapters: listNovelChapters(db, novelId) }
}

export function listNovelVolumes(db: DatabaseSync, novelId: string): NovelVolumeRecord[] {
  return (db.prepare(
    "SELECT * FROM novel_volumes WHERE novel_id = ? ORDER BY order_index ASC",
  ).all(novelId) as VolumeRow[]).map(volumeRow)
}

export function listNovelChapters(db: DatabaseSync, novelId: string): NovelChapterRecord[] {
  return (db.prepare(
    "SELECT * FROM novel_chapters WHERE novel_id = ? ORDER BY number ASC",
  ).all(novelId) as ChapterRow[]).map(chapterRow)
}

export function getNovelChapter(
  db: DatabaseSync,
  novelId: string,
  chapterId: string,
): NovelChapterRecord | null {
  const row = db.prepare(
    "SELECT * FROM novel_chapters WHERE novel_id = ? AND id = ?",
  ).get(novelId, chapterId)
  return row ? chapterRow(row as ChapterRow) : null
}

function wordCount(content: string): number {
  return Array.from(content.replace(/\s+/g, "")).length
}

function appendVersion(
  db: DatabaseSync,
  chapterId: string,
  novelId: string,
  revision: number,
  content: string,
  summary: string,
  sourceSignature: string,
  changeKind: string,
  now: number,
  model = process.env.DEEPSEEK_MODEL || "deepseek-chat",
): void {
  db.prepare(
    `INSERT INTO novel_chapter_versions
      (id, chapter_id, novel_id, revision, content, summary, word_count,
       source_signature, change_kind, model, prompt_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'novel-v1', ?)`,
  ).run(
    `novel_version_${randomUUID()}`,
    chapterId,
    novelId,
    revision,
    content,
    summary,
    wordCount(content),
    sourceSignature,
    changeKind,
    model,
    now,
  )
}

export function saveNovelChapter(
  db: DatabaseSync,
  novelId: string,
  input: {
    number: number
    content: string
    summary: string
    sourceSignature: string
  },
  now = Date.now(),
): NovelChapterRecord {
  const chapter = db.prepare(
    "SELECT * FROM novel_chapters WHERE novel_id = ? AND number = ?",
  ).get(novelId, input.number) as ChapterRow | undefined
  if (!chapter) throw new Error("章节不存在")
  const content = input.content.trim()
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `UPDATE novel_chapters
       SET content = ?, summary = ?, word_count = ?, source_signature = ?,
           status = 'generated', revision = 1, generated_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(content, input.summary.trim(), wordCount(content), input.sourceSignature, now, now, chapter.id)
    appendVersion(
      db,
      chapter.id,
      novelId,
      1,
      content,
      input.summary.trim(),
      input.sourceSignature,
      "generated",
      now,
    )
    const count = db.prepare(
      "SELECT COUNT(*) AS n FROM novel_chapters WHERE novel_id = ? AND status IN ('generated', 'edited')",
    ).get(novelId) as { n: number }
    db.prepare(
      "UPDATE novel_editions SET completed_chapters = ?, updated_at = ? WHERE id = ?",
    ).run(Number(count.n), now, novelId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return chapterRow(db.prepare("SELECT * FROM novel_chapters WHERE id = ?").get(chapter.id) as ChapterRow)
}

export function updateNovelChapter(
  db: DatabaseSync,
  novelId: string,
  number: number,
  input: {
    content?: string
    summary?: string
    title?: string
    outline?: string
    sourceSignature: string
    changeKind: string
  },
  now = Date.now(),
): NovelChapterRecord {
  const chapter = db.prepare(
    "SELECT * FROM novel_chapters WHERE novel_id = ? AND number = ?",
  ).get(novelId, number) as ChapterRow | undefined
  if (!chapter) throw new Error("章节不存在")
  const revision = Number(chapter.revision) + 1
  const content = input.content === undefined ? chapter.content : input.content.trim()
  const summary = input.summary === undefined ? chapter.summary : input.summary.trim()
  const title = input.title === undefined ? chapter.title : input.title.trim().slice(0, 120)
  const outline = input.outline === undefined ? chapter.outline : input.outline.trim()
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `UPDATE novel_chapters
       SET content = ?, summary = ?, title = ?, outline = ?, word_count = ?, source_signature = ?,
           status = 'edited', revision = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      content,
      summary,
      title,
      outline,
      wordCount(content),
      input.sourceSignature,
      revision,
      now,
      chapter.id,
    )
    appendVersion(
      db,
      chapter.id,
      novelId,
      revision,
      content,
      summary,
      input.sourceSignature,
      input.changeKind,
      now,
    )
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return chapterRow(db.prepare("SELECT * FROM novel_chapters WHERE id = ?").get(chapter.id) as ChapterRow)
}

export function markNovelChaptersStale(
  db: DatabaseSync,
  novelId: string,
  newSignature: string,
  now = Date.now(),
): number {
  const result = db.prepare(
    `UPDATE novel_chapters
     SET status = 'stale', updated_at = ?
     WHERE novel_id = ? AND source_signature <> ? AND status IN ('generated', 'edited')`,
  ).run(now, novelId, newSignature)
  db.prepare(
    "UPDATE novel_editions SET source_signature = ?, updated_at = ? WHERE id = ?",
  ).run(newSignature, now, novelId)
  return Number(result.changes)
}

export function enqueueNovelRun(
  db: DatabaseSync,
  novelId: string,
  idempotencyKey: string,
  budgetUnits: number,
  now = Date.now(),
): NovelRunRecord {
  const edition = getNovelEdition(db, novelId)
  if (!edition) throw new Error("小说稿不存在")
  const existing = db.prepare(
    "SELECT * FROM novel_generation_runs WHERE novel_id = ? AND idempotency_key = ?",
  ).get(novelId, idempotencyKey) as RunRow | undefined
  if (existing) return runRow(existing)

  const total = edition.plannedChapters
  if (total <= 0) {
    const error = new Error("请先生成章节目录") as Error & { status?: number }
    error.status = 400
    throw error
  }
  const id = `novel_run_${randomUUID()}`
  db.prepare(
    `INSERT INTO novel_generation_runs
      (id, novel_id, project_id, owner_id, status, cursor, total, completed,
       budget_units, used_units, idempotency_key, updated_at)
     VALUES (?, ?, ?, ?, 'queued', 0, ?, 0, ?, 0, ?, ?)`,
  ).run(id, novelId, edition.projectId, edition.ownerId, total, Math.max(1, budgetUnits), idempotencyKey, now)
  db.prepare(
    "UPDATE novel_editions SET status = 'generating', current_run_id = ?, updated_at = ? WHERE id = ?",
  ).run(id, now, novelId)
  return getNovelRun(db, id)!
}

export function getNovelRun(db: DatabaseSync, runId: string): NovelRunRecord | null {
  const row = db.prepare("SELECT * FROM novel_generation_runs WHERE id = ?").get(runId)
  return row ? runRow(row as RunRow) : null
}

export function updateNovelRun(
  db: DatabaseSync,
  runId: string,
  patch: Partial<Pick<NovelRunRecord,
    "status" | "cursor" | "completed" | "usedUnits" | "error" | "startedAt" | "finishedAt">>,
  now = Date.now(),
): NovelRunRecord {
  const current = getNovelRun(db, runId)
  if (!current) throw new Error("小说生成任务不存在")
  db.prepare(
    `UPDATE novel_generation_runs
     SET status = ?, cursor = ?, completed = ?, used_units = ?, error = ?,
         started_at = ?, finished_at = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    patch.status ?? current.status,
    patch.cursor ?? current.cursor,
    patch.completed ?? current.completed,
    patch.usedUnits ?? current.usedUnits,
    patch.error === undefined ? current.error : patch.error,
    patch.startedAt === undefined ? current.startedAt : patch.startedAt,
    patch.finishedAt === undefined ? current.finishedAt : patch.finishedAt,
    now,
    runId,
  )
  const next = getNovelRun(db, runId)!
  const editionStatus =
    next.status === "complete"
      ? "complete"
      : next.status === "paused"
        ? "paused"
        : next.status === "failed"
          ? "failed"
          : next.status === "waiting"
            ? "generating"
            : "generating"
  db.prepare(
    "UPDATE novel_editions SET status = ?, completed_chapters = ?, updated_at = ? WHERE id = ?",
  ).run(editionStatus, next.completed, now, next.novelId)
  return next
}

export function pauseNovelRun(db: DatabaseSync, novelId: string, now = Date.now()): NovelRunRecord | null {
  const edition = getNovelEdition(db, novelId)
  if (!edition?.currentRunId) return null
  return updateNovelRun(db, edition.currentRunId, { status: "paused" }, now)
}

export function resumeNovelRun(db: DatabaseSync, novelId: string, now = Date.now()): NovelRunRecord | null {
  const edition = getNovelEdition(db, novelId)
  if (!edition?.currentRunId) return null
  return updateNovelRun(db, edition.currentRunId, {
    status: "queued",
    error: null,
    finishedAt: null,
  }, now)
}

export function listNovelChapterVersions(
  db: DatabaseSync,
  chapterId: string,
): Array<{
  revision: number
  content: string
  summary: string
  changeKind: string
  createdAt: number
}> {
  return (db.prepare(
    `SELECT revision, content, summary, change_kind, created_at
     FROM novel_chapter_versions WHERE chapter_id = ? ORDER BY revision DESC`,
  ).all(chapterId) as Array<{
    revision: number
    content: string
    summary: string
    change_kind: string
    created_at: number
  }>).map((row) => ({
    revision: Number(row.revision),
    content: row.content,
    summary: row.summary,
    changeKind: row.change_kind,
    createdAt: Number(row.created_at),
  }))
}
