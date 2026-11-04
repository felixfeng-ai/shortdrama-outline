import type { ProjectDto } from "@/lib/assets/api"
import type { Scene, Shot } from "@/lib/assets/types"
import type { Episode } from "@/lib/types"
import { EMPTY_BRIEF } from "@/lib/brief"
import type { AgentState } from "@/lib/agent/tools"

export type AppDemoProjectSource = "web" | "demo"

export interface AppDemoProject {
  id: string
  title: string
  initial: string
  episode: string
  episodeLabel: string
  scene: string
  sceneCode: string
  question: string
  quote: string
  update: string
  status: string
  storyState: string
  shot: string
  stepCount: string
  workTitle: string
  workLead: string
  decision: string
  source: AppDemoProjectSource
  updatedAt?: number
}

export interface AppDemoProjectDetails {
  episodes: Episode[]
  scenes: Scene[]
  shots: Shot[]
}

export const AGENT_TOOL_STEP_LABELS: Record<string, string> = {
  get_project_status: "项目状态",
  audit_shots: "分镜",
  review_episodes: "分集",
  get_quota: "额度",
  search_docs: "工具文档",
  propose_shot_edit: "镜头改写建议",
  propose_regenerate: "重新生成建议",
}

function relativeUpdated(updatedAt: number, now: number): string {
  const diff = Math.max(0, now - updatedAt)
  if (diff < 60_000) return "刚刚更新"
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(updatedAt).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  })
}

function episodeLabel(number: number): string {
  return `第 ${number} 集`
}

function episodeCode(number: number): string {
  return `EP${String(number).padStart(2, "0")}`
}

export function webProjectFromDto(project: ProjectDto, now = Date.now()): AppDemoProject {
  const title = project.title.trim() || "未命名项目"
  const updatedAt = project.updatedAt
  return {
    id: project.id,
    title,
    initial: title.slice(0, 1),
    episode: "EP01",
    episodeLabel: "第 1 集",
    scene: "尚未生成场次",
    sceneCode: "EP01 · 待排期",
    question: "下一场，要留下什么余味？",
    quote: "“从一句话开始，Agent 会继续拆出人物、场次和镜头。”",
    update: "尚未生成分集",
    status: `${relativeUpdated(updatedAt, now)} · Web 项目`,
    storyState: "待开始",
    shot: "尚未分镜",
    stepCount: "0 个镜头",
    workTitle: "从场次开始",
    workLead: "先写下这一场要发生的事，Agent 会继续拆成镜头。",
    decision: "先确认这场戏的落点",
    source: "web",
    updatedAt,
  }
}

export function enrichWebProject(
  project: AppDemoProject,
  episodes: Episode[],
  scenes: Scene[],
  shots: Shot[],
): AppDemoProject {
  const activeShot = shots[0]
  const episodeNumber =
    (activeShot?.episode && activeShot.episode > 0 ? activeShot.episode : null) ??
    episodes[0]?.number ??
    scenes[0]?.episode ??
    1
  const episode = episodes.find((item) => item.number === episodeNumber)
  const scene =
    (activeShot
      ? scenes.find(
          (item) =>
            item.episode === episodeNumber &&
            item.location === activeShot.scene,
        )
      : null) ??
    scenes.find((item) => item.episode === episodeNumber) ??
    scenes[0]
  const visualLine =
    activeShot?.dialogue?.trim() ||
    episode?.hook?.trim() ||
    episode?.synopsis?.trim() ||
    ""
  const selectedEpisode = episodeCode(episodeNumber)
  const sceneNumber = scene?.number ?? 1
  const storyState =
    shots.length > 0 ? "正在写" : episodes.length > 0 ? "已有分集" : "待开始"

  return {
    ...project,
    episode: selectedEpisode,
    episodeLabel: episodeLabel(episodeNumber),
    scene: scene?.location?.trim() || "尚未生成场次",
    sceneCode: `${selectedEpisode} · SC${String(sceneNumber).padStart(2, "0")}`,
    question: episode?.hook?.trim()
      ? `${episodeLabel(episodeNumber)}的余味，落在哪一句？`
      : "下一场，要留下什么余味？",
    quote: visualLine
      ? `“${visualLine}”`
      : "“从一句话开始，Agent 会继续拆出人物、场次和镜头。”",
    update: `${episodeLabel(episodeNumber)} · ${shots.length} 个镜头`,
    storyState,
    shot: activeShot ? `第 ${activeShot.shot} 镜` : "尚未分镜",
    stepCount: `${shots.length} 个镜头`,
    workTitle: activeShot
      ? `第 ${activeShot.shot} 镜 · 调度校准`
      : "从场次开始",
    workLead:
      activeShot?.action?.trim() ||
      scene?.summary?.trim() ||
      episode?.synopsis?.trim() ||
      "先写下这一场要发生的事，Agent 会继续拆成镜头。",
    decision: activeShot?.speaker?.trim()
      ? `把${activeShot.speaker}的台词落点再校一次`
      : "先确认这场戏的落点",
  }
}

export function orderedShotsForSelection(shots: Shot[], selectedShotNumber?: number): Shot[] {
  if (selectedShotNumber == null) return [...shots]
  const selected = shots.find((shot) => shot.shot === selectedShotNumber)
  if (!selected) return [...shots]
  return [selected, ...shots.filter((shot) => shot.shot !== selectedShotNumber)]
}

export function shotStatusLabel(status: Shot["status"]): string {
  if (status === "done") return "已采用"
  if (status === "rework") return "需返修"
  return "待出图"
}

export function shotPreview(shot: Shot): string {
  return shot.dialogue.trim() || shot.action.trim() || "无台词，按画面调度"
}

export function agentStepLabel(name: string): string {
  return AGENT_TOOL_STEP_LABELS[name] ?? name
}

export function buildAppAgentState(
  project: AppDemoProject,
  details?: AppDemoProjectDetails,
): AgentState {
  const shots = details?.shots ?? []
  const episodes = details?.episodes ?? []
  const scenes = details?.scenes ?? []
  return {
    projectTitle: project.title,
    hasIdea: true,
    brief: EMPTY_BRIEF,
    judgments: [],
    episodes: episodes.map((episode) => ({
      number: episode.number,
      title: episode.title,
      hook: episode.hook,
      intensity: episode.intensity,
    })),
    completed: {
      characters: false,
      acts: false,
      episodes: episodes.length > 0,
      visuals: false,
      scenes: scenes.length > 0,
      shots: shots.length > 0,
    },
    shots: shots.map((shot) => ({
      shot: shot.shot,
      scene: shot.scene,
      characters: shot.characters,
      missingRefFor: shot.missingRefFor ?? [],
      status: shot.status,
      shotSize: shot.shotSize,
      camera: shot.camera,
      prompt: shot.prompt,
      speaker: shot.speaker,
      dialogue: shot.dialogue,
    })),
    expiredShots: 0,
    quota: null,
  }
}
