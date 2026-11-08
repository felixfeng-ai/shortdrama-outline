import type { DatabaseSync } from "node:sqlite"

import { getProject, latestSnapshot, listSnapshots } from "./assets/repo.ts"
import type {
  Scene,
  Shot,
  VisualCharacter,
  VisualPlace,
} from "./assets/types.ts"
import { auditShots } from "./assets/impact.ts"
import { listGeneratedAssets } from "./generation/repo.ts"
import { buildProjectStatus } from "./project-status.ts"
import { buildTodoList, type TodoItem } from "./todo.ts"
import { getProductionPlan } from "./production/repo.ts"
import type {
  ProductionPlanStatus,
  ProductionStageKey,
  ProductionStageStatus,
} from "./production/types.ts"
import { selectedShotMedia } from "./production/selected-media.ts"
import type { ArtifactKind } from "./assets/types.ts"
import type { Act, Character, Episode, StepKey } from "./types.ts"
import { STEPS } from "./types.ts"

const STAGE_LABELS: Record<ProductionStageKey, string> = {
  source: "来源与设定",
  characters: "核心人物",
  outline: "三幕与分集",
  episodes: "分集剧情",
  visuals: "角色定妆",
  scenes: "场次剧本",
  shots: "分镜与视频",
  delivery: "成片与交付",
}

interface ProgressCounts {
  characters: number
  acts: number
  episodes: number
  visuals: number
  scenes: number
  shots: number
  images: number
  videos: number
}

interface ProgressStageInput {
  key: ProductionStageKey
  label: string
  position: number
  total: number
  status: ProductionStageStatus
  planStatus: ProductionPlanStatus
}

export interface ProjectProgressInput {
  projectId: string
  projectTitle: string
  counts: ProgressCounts
  completed: Record<StepKey, boolean>
  todoItems: TodoItem[]
  productionStage: ProgressStageInput | null
}

export interface ProjectProgressDto {
  project: { id: string; title: string }
  sixStep: {
    currentKey: StepKey
    currentIndex: number
    currentLabel: string
    completed: number
    total: number
    percentage: number
    steps: Array<{
      key: StepKey
      index: number
      label: string
      completed: boolean
      current: boolean
    }>
  }
  productionStage: ProgressStageInput & {
    percentage: number
  }
  blocker: {
    id: string
    text: string
    step: StepKey
    kind: "fix"
  } | null
  nextAction: {
    id: string
    text: string
    step: StepKey
    kind: "next"
  } | null
  counts: ProgressCounts
}

function deriveProductionStageKey(completed: Record<StepKey, boolean>): ProductionStageKey {
  if (!completed.characters) return "source"
  if (!completed.acts) return "characters"
  if (!completed.episodes) return "outline"
  if (!completed.visuals) return "episodes"
  if (!completed.scenes) return "visuals"
  if (!completed.shots) return "scenes"
  return "delivery"
}

export function buildProjectProgress(input: ProjectProgressInput): ProjectProgressDto {
  const completedCount = STEPS.filter((step) => input.completed[step.key]).length
  const currentStep = STEPS.find((step) => !input.completed[step.key]) ?? STEPS[STEPS.length - 1]
  const blockerItem = input.todoItems.find((item) => item.kind === "fix") ?? null
  const nextItem = input.todoItems.find((item) => item.kind === "next") ?? null
  const derivedStageKey = deriveProductionStageKey(input.completed)
  const stagePosition = Math.max(
    0,
    Object.keys(STAGE_LABELS).indexOf(input.productionStage?.key ?? derivedStageKey),
  )
  const productionStage = input.productionStage ?? {
    key: derivedStageKey,
    label: STAGE_LABELS[derivedStageKey],
    position: stagePosition,
    total: 8,
    status: "draft" as const,
    planStatus: "draft" as const,
  }

  return {
    project: {
      id: input.projectId,
      title: input.projectTitle,
    },
    sixStep: {
      currentKey: currentStep.key,
      currentIndex: currentStep.index,
      currentLabel: currentStep.nav,
      completed: completedCount,
      total: STEPS.length,
      percentage: Math.round(completedCount / STEPS.length * 100),
      steps: STEPS.map((step) => ({
        key: step.key,
        index: step.index,
        label: step.nav,
        completed: input.completed[step.key],
        current: step.key === currentStep.key,
      })),
    },
    productionStage: {
      ...productionStage,
      label: productionStage.label || STAGE_LABELS[productionStage.key],
      percentage: Math.round((productionStage.position + 1) / productionStage.total * 100),
    },
    blocker: blockerItem
      ? {
          id: blockerItem.id,
          text: blockerItem.text,
          step: blockerItem.step,
          kind: "fix",
        }
      : null,
    nextAction: nextItem
      ? {
          id: nextItem.id,
          text: nextItem.text,
          step: nextItem.step,
          kind: "next",
        }
      : null,
    counts: input.counts,
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

export function readProjectProgress(
  db: DatabaseSync,
  projectId: string,
): ProjectProgressDto {
  const project = getProject(db, projectId)
  if (!project) throw new Error("项目不存在")
  const characters = snapshotArray<Character>(db, projectId, "characters")
  const acts = snapshotArray<Act>(db, projectId, "acts")
  const episodes = snapshotArray<Episode>(db, projectId, "episodes")
  const visuals = snapshotArray<VisualCharacter>(db, projectId, "visualCharacters")
  const scenes = snapshotArray<Scene>(db, projectId, "scenes")
  const places = snapshotArray<VisualPlace>(db, projectId, "visualPlaces")
  const shots = snapshotArray<Shot>(db, projectId, "shots")
  const shotAssets = selectedShotMedia(shots, listGeneratedAssets(db, projectId))
  const imageCount = [...shotAssets.values()].filter((media) => Boolean(media.image)).length
  const videoCount = [...shotAssets.values()].filter((media) => Boolean(media.video)).length
  const audit = auditShots(
    listSnapshots(db, projectId, "visualCharacters"),
    listSnapshots(db, projectId, "shots"),
  )
  const status = buildProjectStatus({
    characters,
    acts,
    episodes,
    visuals,
    scenes,
    places,
    shots,
    expiredShots: audit.expired,
    visualsStale: audit.outOfSync,
  })
  const completed = {
    characters: characters.length > 0,
    acts: acts.length > 0,
    episodes: episodes.length > 0,
    visuals: visuals.length > 0,
    scenes: scenes.length > 0,
    shots: shots.length > 0,
  }
  const todoItems = buildTodoList({
    completed,
    shots,
    expiredShots: audit.expired,
    hasIdea: episodes.length > 0 || characters.length > 0,
  })
  const plan = getProductionPlan(db, projectId)
  const currentStage = plan?.stages.find((stage) => stage.key === plan.currentStage)

  return buildProjectProgress({
    projectId,
    projectTitle: project.title,
    counts: {
      ...status.counts,
      images: imageCount,
      videos: videoCount,
    },
    completed,
    todoItems,
    productionStage: plan && currentStage
      ? {
          key: plan.currentStage,
          label: currentStage.label,
          position: currentStage.position,
          total: plan.stages.length,
          status: currentStage.status,
          planStatus: plan.status,
        }
      : null,
  })
}
