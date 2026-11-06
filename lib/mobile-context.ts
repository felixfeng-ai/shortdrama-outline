import type {
  ArtifactKind,
  Shot,
  VisualCharacter,
  VisualPlace,
} from './assets/types.ts'
import type { Project } from './assets/repo.ts'
import { generationTaskTargetLabel } from './generation/task-view.ts'
import { buildCharacterKeyframePrompt } from './generation/prompt.ts'
import { buildPlaceImagePrompt } from './assets/anchors.ts'
import type {
  GenerationStatus,
  GeneratedAsset,
  GenerationBatch,
  GenerationTargetType,
  GenerationTask,
} from './generation/types.ts'
import {
  buildMobileVideoView,
  type MobileVideoReadiness,
  type MobileVideoTarget,
} from './mobile-video.ts'
import {
  getPublicVideoCapabilities,
  type PublicVideoCapabilities,
} from './video/model.ts'
import {
  buildMobileAgentMemory,
  EMPTY_MOBILE_AGENT_MEMORY,
  type MobileAgentMemory,
} from './mobile-memory.ts'
import {
  analyzeEpisodePacing,
  type MobilePacingReport,
} from './mobile-pacing.ts'

export interface MobileContextQuota {
  remaining: number
  limit: number
  used: number
  projectsLeft: number
  episodeCount?: number
  projectCost?: number
  pricingVersion?: string
  estimates?: {
    selected: {
      episodeCount: number
      units: number
      projectsLeft: number
    }
    presets: Array<{
      episodeCount: number
      units: number
      projectsLeft: number
    }>
  }
}

export interface MobileContextProject {
  id: string
  title: string
  episode: string
  step: string
  completedSteps: number
  pendingCount: number
  shotCount: number
  updatedLabel: string
  status: 'active' | 'draft' | 'complete'
  hasDetails: boolean
}

export interface MobileContextHero {
  episodeNumber: number
  episodeTitle: string
  sceneNumber: number
  sceneLocation: string
  timeOfDay: string
  sceneSummary: string
  shotNumber: number | null
  shotCount: number
  contextBadge: string
  agentContextLabel: string
  targetLabel: string
  evidence: string
}

export interface MobileContextTask {
  id: string
  targetType: GenerationTargetType
  targetId: string
  targetLabel: string
  status: GenerationStatus
  error: string | null
  assetId: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
  mediaKind: 'image' | 'video' | 'audio'
  batchId: string | null
  estimatedCostMicros: number
  actualCostMicros: number
}

export interface MobileGenerationTarget {
  targetType: 'character' | 'place' | 'shot'
  targetId: string
  targetLabel: string
  prompt: string
  aspect: 'portrait' | 'landscape' | 'vertical'
}

export interface MobileContextData {
  activeProject: MobileContextProject | null
  projects: MobileContextProject[]
  totalProjects: number
  hero: MobileContextHero | null
  quota: MobileContextQuota
  tasks: MobileContextTask[]
  generationTargets: MobileGenerationTarget[]
  videoCapabilities: PublicVideoCapabilities
  videoTargets: MobileVideoTarget[]
  videoReadiness: MobileVideoReadiness
  batches: GenerationBatch[]
  agentMemory: MobileAgentMemory
  pacing: MobilePacingReport
}

type SnapshotPayloads = Partial<Record<ArtifactKind, unknown>>

const STEP_KINDS: ReadonlyArray<{ kind: ArtifactKind; label: string }> = [
  { kind: 'characters', label: '人物' },
  { kind: 'acts', label: '三幕' },
  { kind: 'episodes', label: '分集' },
  { kind: 'visualCharacters', label: '定妆' },
  { kind: 'scenes', label: '场景' },
  { kind: 'shots', label: '分镜' },
]

function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : []
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function formatUpdatedLabel(updatedAt: number, now: number): string {
  const elapsed = Math.max(0, now - updatedAt)
  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`

  const date = new Date(updatedAt)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function projectBase(project: Project, now: number): MobileContextProject {
  return {
    id: project.id,
    title: project.title,
    episode: '',
    step: '已同步',
    completedSteps: 0,
    pendingCount: 0,
    shotCount: 0,
    updatedLabel: formatUpdatedLabel(project.updatedAt, now),
    status: 'active',
    hasDetails: false,
  }
}

function buildHero(
  project: Project,
  snapshots: SnapshotPayloads,
  shotCount: number,
): MobileContextHero | null {
  const episodes = readArray(snapshots.episodes)
  const scenes = readArray(snapshots.scenes)
  if (scenes.length === 0) return null

  const latestEpisode = [...episodes].sort(
    (a, b) => readNumber(b.number) - readNumber(a.number),
  )[0]
  const episodeNumber = latestEpisode
    ? readNumber(latestEpisode.number, readNumber(scenes[0].episode, 1))
    : readNumber(scenes[0].episode, 1)
  const episodeTitle = readText(latestEpisode?.title) || `第 ${episodeNumber} 集`

  const scene = scenes
    .filter((item) => readNumber(item.episode, 1) === episodeNumber)
    .sort((a, b) => readNumber(a.number) - readNumber(b.number))
    .at(-1) ?? scenes.at(-1)!
  const sceneNumber = readNumber(scene.number, 1)
  const sceneLocation = readText(scene.location) || '未命名场景'
  const shots = readArray(snapshots.shots)
  const sceneShots = shots
    .filter(
      (shot) =>
        readNumber(shot.episode, episodeNumber) === episodeNumber &&
        readText(shot.scene) === sceneLocation,
    )
    .sort((a, b) => readNumber(a.shot) - readNumber(b.shot))
  const shot = sceneShots.at(-1) ?? shots.at(-1)
  const shotNumber = shot ? readNumber(shot.shot) || null : null
  const episodeCode = `EP${String(episodeNumber).padStart(2, '0')}`

  return {
    episodeNumber,
    episodeTitle,
    sceneNumber,
    sceneLocation,
    timeOfDay: readText(scene.timeOfDay),
    sceneSummary: readText(scene.summary),
    shotNumber,
    shotCount,
    contextBadge: `${episodeCode} · 场 ${sceneNumber}`,
    agentContextLabel: `${project.title} · 第 ${episodeNumber} 集 · 场 ${sceneNumber}`,
    targetLabel: shotNumber
      ? `${episodeCode} · 场 ${sceneNumber} · 第 ${shotNumber} 镜`
      : `${episodeCode} · 场 ${sceneNumber}`,
    evidence: `${shotCount} 个镜头 · ${episodeTitle} · ${sceneLocation}`,
  }
}

export function buildMobileContext(input: {
  projects: Project[]
  snapshots: SnapshotPayloads
  quota: MobileContextQuota
  now: number
  activeProjectId?: string | null
  tasks?: readonly GenerationTask[]
  assets?: readonly GeneratedAsset[]
  batches?: readonly GenerationBatch[]
  videoCapabilities?: PublicVideoCapabilities
  decisions?: unknown
  judgments?: unknown
  comments?: unknown
}): MobileContextData {
  const { projects, snapshots, quota, now } = input
  const videoCapabilities = input.videoCapabilities ?? getPublicVideoCapabilities({})
  const videoView = buildMobileVideoView({
    shots: snapshots.shots,
    assets: [...(input.assets ?? [])],
    tasks: [...(input.tasks ?? [])],
  })
  const agentMemory = buildMobileAgentMemory({
    visualCharacters: snapshots.visualCharacters,
    visualPlaces: snapshots.visualPlaces,
    decisions: input.decisions,
    judgments: input.judgments,
    comments: input.comments,
  })
  const pacing = analyzeEpisodePacing({
    episodes: readArray(snapshots.episodes).map((episode) => ({
      number: readNumber(episode.number),
      title: readText(episode.title),
      hook: readText(episode.hook),
    })),
    shots: readArray(snapshots.shots).map((shot) => ({
      episode: readNumber(shot.episode),
      dialogue: readText(shot.dialogue),
      params: {
        duration: readNumber((shot.params as Record<string, unknown> | undefined)?.duration),
      },
    })),
  })
  if (projects.length === 0) {
    return {
      activeProject: null,
      projects: [],
      totalProjects: 0,
      hero: null,
      quota,
      tasks: [],
      generationTargets: [],
      videoCapabilities,
      videoTargets: videoView.targets,
      videoReadiness: videoView.readiness,
      batches: [],
      agentMemory,
      pacing,
    }
  }

  const active = input.activeProjectId
    ? projects.find((project) => project.id === input.activeProjectId) ?? projects[0]
    : projects[0]
  const orderedProjects = [active, ...projects.filter((project) => project.id !== active.id)]
  const presentSteps = STEP_KINDS.map(({ kind }) => {
    const payload = snapshots[kind]
    return Array.isArray(payload) && payload.length > 0
  })
  const completedSteps = presentSteps.filter(Boolean).length
  const currentStepIndex = presentSteps.lastIndexOf(true)
  const shotCount = readArray(snapshots.shots).length
  const activeProject: MobileContextProject = {
    ...projectBase(active, now),
    step: currentStepIndex >= 0 ? STEP_KINDS[currentStepIndex].label : '未开始',
    completedSteps,
    shotCount,
    status: completedSteps >= STEP_KINDS.length ? 'complete' : 'active',
    hasDetails: true,
  }
  const hero = buildHero(active, snapshots, shotCount)
  if (hero) activeProject.episode = `第 ${hero.episodeNumber} 集`
  const tasks = (input.tasks ?? [])
    .filter((task) => task.projectId === active.id)
    .slice(0, 50)
    .map((task): MobileContextTask => ({
      id: task.id,
      targetType: task.targetType,
      targetId: task.targetId,
      targetLabel: generationTaskTargetLabel(
        task,
        readArray(snapshots.visualCharacters) as unknown as VisualCharacter[],
        readArray(snapshots.shots) as unknown as Shot[],
        readArray(snapshots.visualPlaces) as unknown as VisualPlace[],
      ),
      status: task.status,
      error: task.error,
      assetId: task.assetId,
      createdAt: task.createdAt,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      mediaKind: task.mediaKind ?? 'image',
      batchId: task.batchId ?? null,
      estimatedCostMicros: task.estimatedCostMicros ?? 0,
      actualCostMicros: task.actualCostMicros ?? 0,
    }))
  const generationTargets: MobileGenerationTarget[] = [
    ...readArray(snapshots.visualCharacters).map((item) => ({
      targetType: 'character' as const,
      targetId: readText(item.entityId) || readText(item.id),
      targetLabel: `角色 · ${readText(item.name) || '未命名角色'}`,
      prompt: buildCharacterKeyframePrompt(item as unknown as VisualCharacter),
      aspect: 'portrait' as const,
    })),
    ...readArray(snapshots.visualPlaces).map((item) => ({
      targetType: 'place' as const,
      targetId: readText(item.id) || readText(item.name),
      targetLabel: `地点 · ${readText(item.name) || '未命名地点'}`,
      prompt: buildPlaceImagePrompt(item as unknown as VisualPlace),
      aspect: 'landscape' as const,
    })),
    ...readArray(snapshots.shots).map((item) => {
      const episode = readNumber(item.episode)
      const shot = readNumber(item.shot)
      const scene = readText(item.scene) || '未命名场景'
      return {
        targetType: 'shot' as const,
        targetId: readText(item.entityId) || readText(item.id),
        targetLabel: `${episode > 0 ? `第 ${episode} 集 · ` : ''}第 ${shot} 镜 · ${scene}`,
        prompt: readText(item.prompt) || readText(item.action),
        aspect: 'vertical' as const,
      }
    }),
  ].filter((target) => target.targetId && target.prompt.trim())

  return {
    activeProject,
    projects: orderedProjects.slice(0, 20).map((project, index) =>
      index === 0 ? activeProject : projectBase(project, now),
    ),
    totalProjects: projects.length,
    hero,
    quota,
    tasks,
    generationTargets,
    videoCapabilities,
    videoTargets: videoView.targets,
    videoReadiness: videoView.readiness,
    batches: (input.batches ?? []).filter((batch) => batch.projectId === active.id),
    agentMemory,
    pacing,
  }
}
