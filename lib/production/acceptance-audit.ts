import type { DatabaseSync } from "node:sqlite"

import { latestSnapshot, getProject } from "../assets/repo.ts"
import type {
  ArtifactKind,
  Scene,
  Shot,
  VisualCharacter,
} from "../assets/types.ts"
import type { Act, Character, Episode } from "../types.ts"
import { InputError } from "../api.ts"
import { listGeneratedAssets, listGenerationTasks } from "../generation/repo.ts"
import type { GeneratedAsset, GenerationTask } from "../generation/types.ts"
import { listDeliveryItems, listDeliveryPackages } from "../delivery/repo.ts"
import { listVideoRenders } from "../video/render-repo.ts"
import type { VideoRender } from "../video/render-types.ts"
import { selectedShotMedia } from "./selected-media.ts"

const DEFAULT_EXPECTED_EPISODES = 10
const STALE_TASK_MS = 60 * 60 * 1000

type CheckStatus = "pass" | "missing" | "blocked"

interface AcceptanceCheck {
  id: string
  label: string
  status: CheckStatus
  actual: string
  expected: string
  detail: string
}

type AcceptanceWorkspace =
  | "characters"
  | "acts"
  | "episodes"
  | "visuals"
  | "scenes"
  | "shots"
  | "tasks"
  | "delivery"

interface AcceptanceAction {
  id: string
  checkId: string
  label: string
  description: string
  workspace: AcceptanceWorkspace
  costImpact: "none" | "may_charge"
  autoRunnable: boolean
}

export interface AcceptanceAuditInput {
  projectId: string
  characters: Character[]
  acts: Act[]
  episodes: Episode[]
  visualCharacters: VisualCharacter[]
  scenes: Scene[]
  shots: Shot[]
  assets: GeneratedAsset[]
  tasks: GenerationTask[]
  renders: VideoRender[]
  deliveryEpisodes: number[]
  expectedEpisodes?: number
  now?: number
}

export interface ProductionAcceptanceReport {
  projectId: string
  generatedAt: number
  verdict: "ready" | "incomplete" | "blocked"
  counts: {
    characters: number
    acts: number
    episodes: number
    visuals: number
    scenes: number
    shots: number
    imageEpisodes: number
    videoEpisodes: number
    deliveredEpisodes: number
  }
  tasks: {
    total: number
    latestFailed: number
    staleActive: number
  }
  checks: AcceptanceCheck[]
  actions: AcceptanceAction[]
  nextAction: AcceptanceAction | null
}

function expectedEpisodeSet(expectedEpisodes: number): Set<number> {
  return new Set(Array.from({ length: expectedEpisodes }, (_, index) => index + 1))
}

function coveredEpisodeCount(values: number[], expectedEpisodes: number): number {
  const expected = expectedEpisodeSet(expectedEpisodes)
  return new Set(
    values.filter((episode) => expected.has(episode)),
  ).size
}

function check(
  id: string,
  label: string,
  status: CheckStatus,
  actual: string,
  expected: string,
  detail: string,
): AcceptanceCheck {
  return { id, label, status, actual, expected, detail }
}

const ACTION_META: Record<string, {
  label: string
  workspace: AcceptanceWorkspace
  costImpact: AcceptanceAction["costImpact"]
}> = {
  characters: { label: "生成核心人物", workspace: "characters", costImpact: "may_charge" },
  acts: { label: "生成三幕结构", workspace: "acts", costImpact: "may_charge" },
  episodes: { label: "补齐分集", workspace: "episodes", costImpact: "may_charge" },
  visuals: { label: "补齐角色定妆", workspace: "visuals", costImpact: "may_charge" },
  scenes: { label: "补齐场次", workspace: "scenes", costImpact: "may_charge" },
  shots: { label: "补齐分镜", workspace: "shots", costImpact: "may_charge" },
  images: { label: "生成并采用首帧", workspace: "shots", costImpact: "may_charge" },
  videos: { label: "生成并采用镜头视频", workspace: "shots", costImpact: "may_charge" },
  renders: { label: "渲染交付版", workspace: "shots", costImpact: "may_charge" },
  delivery: { label: "创建交付包", workspace: "delivery", costImpact: "may_charge" },
  tasks: { label: "处理失败或卡住任务", workspace: "tasks", costImpact: "may_charge" },
}

function actionFor(check: AcceptanceCheck): AcceptanceAction {
  const meta = ACTION_META[check.id]
  if (!meta) throw new Error(`缺少验收修复动作：${check.id}`)
  return {
    id: `fix-${check.id}`,
    checkId: check.id,
    label: meta.label,
    description: `${check.label}未通过：${check.detail} 当前 ${check.actual}，目标 ${check.expected}。`,
    workspace: meta.workspace,
    costImpact: meta.costImpact,
    autoRunnable: false,
  }
}

function latestTasks(tasks: GenerationTask[]): GenerationTask[] {
  const latest = new Map<string, GenerationTask>()
  for (const task of [...tasks].sort((left, right) => right.createdAt - left.createdAt)) {
    const key = `${task.targetType}:${task.targetId}:${task.mediaKind ?? "image"}`
    if (!latest.has(key)) latest.set(key, task)
  }
  return [...latest.values()]
}

export function buildProductionAcceptanceReport(
  input: AcceptanceAuditInput,
): ProductionAcceptanceReport {
  const expectedEpisodes = Math.max(1, Math.floor(input.expectedEpisodes ?? DEFAULT_EXPECTED_EPISODES))
  const now = input.now ?? Date.now()
  const selectedMedia = selectedShotMedia(input.shots, input.assets)
  const selectedImageEpisodes = input.shots
    .filter((shot) => Boolean(selectedMedia.get(shot.id)?.image))
    .map((shot) => shot.episode)
  const selectedVideoEpisodes = input.shots
    .filter((shot) => Boolean(selectedMedia.get(shot.id)?.video))
    .map((shot) => shot.episode)
  const sceneEpisodes = coveredEpisodeCount(input.scenes.map((scene) => scene.episode), expectedEpisodes)
  const shotCoverage = coveredEpisodeCount(input.shots.map((shot) => shot.episode), expectedEpisodes)
  const imageCoverage = coveredEpisodeCount(selectedImageEpisodes, expectedEpisodes)
  const videoCoverage = coveredEpisodeCount(selectedVideoEpisodes, expectedEpisodes)
  const deliveredCoverage = coveredEpisodeCount(input.deliveryEpisodes, expectedEpisodes)
  const renderedCoverage = coveredEpisodeCount(
    input.renders
      .filter((render) => render.qualityProfile === "delivery" && render.status === "succeeded")
      .map((render) => render.episode),
    expectedEpisodes,
  )
  const characterNames = new Set(input.characters.map((character) => character.name.trim()).filter(Boolean))
  const visualNames = new Set(input.visualCharacters.map((visual) => visual.name.trim()).filter(Boolean))
  const missingVisualNames = [...characterNames].filter((name) => !visualNames.has(name))
  const currentTasks = latestTasks(input.tasks)
  const failedTasks = currentTasks.filter((task) => task.status === "failed")
  const staleTasks = currentTasks.filter((task) => {
    if (task.status !== "queued" && task.status !== "running") return false
    const lastActivity = task.finishedAt ?? task.startedAt ?? task.createdAt
    return now - lastActivity > STALE_TASK_MS
  })
  const episodes = new Set(input.episodes.map((episode) => episode.number).filter((number) => number >= 1 && number <= expectedEpisodes))

  const checks: AcceptanceCheck[] = [
    check(
      "characters",
      "核心人物",
      input.characters.length > 0 ? "pass" : "missing",
      `${input.characters.length} 个`,
      "至少 1 个",
      "核心人物必须已经写入最新人物快照。",
    ),
    check(
      "acts",
      "三幕结构",
      input.acts.length > 0 ? "pass" : "missing",
      `${input.acts.length} 幕`,
      "至少 1 幕",
      "三幕结构必须已经写入最新大纲快照。",
    ),
    check(
      "episodes",
      "分集覆盖",
      episodes.size >= expectedEpisodes ? "pass" : "missing",
      `${episodes.size} / ${expectedEpisodes} 集`,
      `${expectedEpisodes} / ${expectedEpisodes} 集`,
      "每一集都需要存在正式分集快照。",
    ),
    check(
      "visuals",
      "角色定妆",
      characterNames.size > 0 && missingVisualNames.length === 0 ? "pass" : "missing",
      missingVisualNames.length > 0 ? `缺少 ${missingVisualNames.length} 个` : `${input.visualCharacters.length} 个`,
      "所有核心人物都有定妆记录",
      "角色定妆必须覆盖最新核心人物名单。",
    ),
    check(
      "scenes",
      "场次覆盖",
      sceneEpisodes >= expectedEpisodes ? "pass" : "missing",
      `${sceneEpisodes} / ${expectedEpisodes} 集`,
      `${expectedEpisodes} / ${expectedEpisodes} 集`,
      "每一集至少需要一个场次。",
    ),
    check(
      "shots",
      "分镜覆盖",
      shotCoverage >= expectedEpisodes ? "pass" : "missing",
      `${shotCoverage} / ${expectedEpisodes} 集`,
      `${expectedEpisodes} / ${expectedEpisodes} 集`,
      "每一集至少需要一个分镜。",
    ),
    check(
      "images",
      "已采用首帧",
      imageCoverage >= expectedEpisodes ? "pass" : "missing",
      `${imageCoverage} / ${expectedEpisodes} 集`,
      `${expectedEpisodes} / ${expectedEpisodes} 集`,
      "每一集至少需要一张已采用首帧。",
    ),
    check(
      "videos",
      "已采用镜头视频",
      videoCoverage >= expectedEpisodes ? "pass" : "missing",
      `${videoCoverage} / ${expectedEpisodes} 集`,
      `${expectedEpisodes} / ${expectedEpisodes} 集`,
      "每一集至少需要一条已采用镜头视频。",
    ),
    check(
      "renders",
      "交付版渲染",
      renderedCoverage >= expectedEpisodes ? "pass" : "missing",
      `${renderedCoverage} / ${expectedEpisodes} 集`,
      `${expectedEpisodes} / ${expectedEpisodes} 集`,
      "每一集都需要至少一个成功的交付版成片渲染。",
    ),
    check(
      "delivery",
      "交付包覆盖",
      deliveredCoverage >= expectedEpisodes ? "pass" : "missing",
      `${deliveredCoverage} / ${expectedEpisodes} 集`,
      `${expectedEpisodes} / ${expectedEpisodes} 集`,
      "单集或整季交付包必须覆盖全部验收集数。",
    ),
    check(
      "tasks",
      "任务健康",
      failedTasks.length > 0 || staleTasks.length > 0 ? "blocked" : "pass",
      `${failedTasks.length} 个最新失败 · ${staleTasks.length} 个卡住`,
      "0 个最新失败 · 0 个卡住",
      "以每个目标和媒体的最新生成任务为准；旧失败被成功重试覆盖后不阻断。",
    ),
  ]

  const verdict = checks.some((item) => item.status === "blocked")
    ? "blocked"
    : checks.some((item) => item.status === "missing")
      ? "incomplete"
      : "ready"
  const blockedActions = checks
    .filter((item) => item.status === "blocked")
    .map(actionFor)
  const missingActions = checks
    .filter((item) => item.status === "missing")
    .map(actionFor)
  const actions = [...blockedActions, ...missingActions]

  return {
    projectId: input.projectId,
    generatedAt: now,
    verdict,
    counts: {
      characters: input.characters.length,
      acts: input.acts.length,
      episodes: episodes.size,
      visuals: input.visualCharacters.length,
      scenes: input.scenes.length,
      shots: input.shots.length,
      imageEpisodes: imageCoverage,
      videoEpisodes: videoCoverage,
      deliveredEpisodes: deliveredCoverage,
    },
    tasks: {
      total: input.tasks.length,
      latestFailed: failedTasks.length,
      staleActive: staleTasks.length,
    },
    checks,
    actions,
    nextAction: actions[0] ?? null,
  }
}

function snapshotArray<T>(
  db: DatabaseSync,
  projectId: string,
  kind: ArtifactKind,
): T[] {
  const snapshot = latestSnapshot(db, projectId, kind)
  return Array.isArray(snapshot?.payload) ? snapshot.payload as T[] : []
}

export function auditProductionAcceptance(
  db: DatabaseSync,
  projectId: string,
  now = Date.now(),
  expectedEpisodes = DEFAULT_EXPECTED_EPISODES,
): ProductionAcceptanceReport {
  const project = getProject(db, projectId)
  if (!project) throw new InputError("项目不存在")

  const deliveryEpisodes = listDeliveryPackages(db, projectId)
    .filter((pkg) => pkg.status === "ready")
    .flatMap((pkg) => listDeliveryItems(db, pkg.id))
    .filter((item) => item.status === "ready")
    .map((item) => item.episode)

  return buildProductionAcceptanceReport({
    projectId,
    characters: snapshotArray<Character>(db, projectId, "characters"),
    acts: snapshotArray<Act>(db, projectId, "acts"),
    episodes: snapshotArray<Episode>(db, projectId, "episodes"),
    visualCharacters: snapshotArray<VisualCharacter>(db, projectId, "visualCharacters"),
    scenes: snapshotArray<Scene>(db, projectId, "scenes"),
    shots: snapshotArray<Shot>(db, projectId, "shots"),
    assets: listGeneratedAssets(db, projectId),
    tasks: listGenerationTasks(db, projectId),
    renders: listVideoRenders(db, projectId),
    deliveryEpisodes,
    expectedEpisodes,
    now,
  })
}
