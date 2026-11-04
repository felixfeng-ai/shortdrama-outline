import {
  isSupportedDuration,
  type Shot,
  type VisualCharacter,
  type VisualPlace,
} from "../assets/types.ts"
import { missingLockedTraits, visualTraitLabel } from "../assets/anchors.ts"
import { shotsToCsv, shotsToWorkList } from "../assets/export.ts"
import { buildJianyingDelivery } from "./jianying.ts"
import {
  buildAiExportDisclosure,
  type AiExportDisclosure,
} from "./ai-disclosure.ts"

export const PLATFORM_EXPORT_TARGETS = ["general", "jimeng", "kling", "jianying", "json"] as const
export type PlatformExportTarget = (typeof PLATFORM_EXPORT_TARGETS)[number]

export type PlatformPreflightCode =
  | "invalid-duration"
  | "invalid-ratio"
  | "missing-prompt"
  | "missing-keyframe"
  | "long-prompt"
  | "missing-anchor"
  | "locked-trait"
  | "missing-reference"
  | "last-shot-chain"
  | "cross-episode-chain"

export interface PlatformPreflightIssue {
  code: PlatformPreflightCode
  severity: "blocking" | "warning"
  shot: number
  episode: number
  entityId: string
  message: string
  character?: string
}

export interface PlatformPreflight {
  target: PlatformExportTarget
  blocking: number
  warning: number
  issues: PlatformPreflightIssue[]
}

export type PlatformProfileMode =
  | "generic"
  | "image-to-video"
  | "first-last-frame"
  | "edit"
  | "automation"

export interface PlatformProfile {
  target: PlatformExportTarget
  label: string
  mode: PlatformProfileMode
  summary: string
  requiresKeyframe: boolean
  steps: string[]
}

export interface PlatformExportFile {
  path: string
  kind: "csv" | "text" | "json"
  content: string
}

export interface PlatformExportShot {
  episode: number
  shot: number
  entityId: string
  scene: string
  place: string
  characters: string[]
  prompt: string
  shotSize: string
  camera: string
  refImages: string[]
  params: Shot["params"]
  selectedKeyframe: string | null
}

export interface PlatformExportKit {
  target: PlatformExportTarget
  shotCount: number
  preflight: PlatformPreflight
  files: PlatformExportFile[]
  manifest: {
    schema: "chengju.platform-export"
    schemaVersion: 1
    target: PlatformExportTarget
    title: string
    exportedAt: number
    shotCount: number
    ai: AiExportDisclosure
    profile: PlatformProfile
    preflight: PlatformPreflight
    shots: PlatformExportShot[]
  }
}

const PLATFORM_LABELS: Record<PlatformExportTarget, string> = {
  general: "通用",
  jimeng: "即梦",
  kling: "可灵",
  jianying: "剪映",
  json: "结构化 JSON",
}

const PLATFORM_PROFILES: Record<PlatformExportTarget, PlatformProfile> = {
  general: {
    target: "general",
    label: "通用",
    mode: "generic",
    summary: "保留原始提示词与完整参数，适合人工整理或接入自建流程。",
    requiresKeyframe: false,
    steps: ["按集镜浏览执行单", "准备参考图与首帧", "按目标工具自行配置参数"],
  },
  jimeng: {
    target: "jimeng",
    label: "即梦",
    mode: "image-to-video",
    summary: "按首帧图生视频组织提示词；需要镜头衔接时再用首尾帧。",
    requiresKeyframe: true,
    steps: ["先准备本镜已采用首帧", "粘贴纯提示词并设置画幅、时长", "需要衔接时补上一镜末帧"],
  },
  kling: {
    target: "kling",
    label: "可灵",
    mode: "first-last-frame",
    summary: "按首帧起片组织执行；衔接镜头使用首尾帧，尾帧来自上一镜成片。",
    requiresKeyframe: true,
    steps: ["上传本镜首帧", "勾选衔接的镜头补尾帧", "核对提示词、画幅与时长后生成"],
  },
  jianying: {
    target: "jianying",
    label: "剪映",
    mode: "edit",
    summary: "按镜头顺序、台词和字幕清单装配，不生成私有草稿。",
    requiresKeyframe: false,
    steps: ["按 shot-order.csv 排列画面", "按 dialogue.csv 导入台词", "核对素材映射后剪辑"],
  },
  json: {
    target: "json",
    label: "结构化 JSON",
    mode: "automation",
    summary: "提供稳定 schema 与完整执行参数，供外部工具或自动化脚本读取。",
    requiresKeyframe: false,
    steps: ["读取 manifest.json", "按 entityId 关联镜头与素材", "自行处理生成与回调"],
  },
}

const SUPPORTED_RATIOS = new Set(["9:16", "16:9"])

export function platformLabel(target: PlatformExportTarget): string {
  return PLATFORM_LABELS[target]
}

export function platformProfile(target: PlatformExportTarget): PlatformProfile {
  return PLATFORM_PROFILES[target]
}

export function readPlatformExportTarget(value: unknown): PlatformExportTarget {
  return (PLATFORM_EXPORT_TARGETS as readonly unknown[]).includes(value)
    ? value as PlatformExportTarget
    : "general"
}

function shotIssue(
  shot: Shot,
  code: PlatformPreflightCode,
  severity: PlatformPreflightIssue["severity"],
  message: string,
  character?: string,
): PlatformPreflightIssue {
  return {
    code,
    severity,
    shot: shot.shot,
    episode: shot.episode,
    entityId: shot.entityId,
    message,
    ...(character ? { character } : {}),
  }
}

export function preflightPlatformExport(
  shots: Shot[],
  input: {
    target: PlatformExportTarget
    visuals?: VisualCharacter[]
    places?: VisualPlace[]
    /** 只有调用方拿到真实采用图清单时才传；不传就表示无法判断首帧缺口。 */
    keyframePathByTargetId?: Record<string, string>
  },
): PlatformPreflight {
  const visualsByName = new Map((input.visuals ?? []).map((visual) => [visual.name, visual]))
  const placesByName = new Map((input.places ?? []).map((place) => [place.name, place]))
  const profile = platformProfile(input.target)
  const issues: PlatformPreflightIssue[] = []

  shots.forEach((shot, index) => {
    if (!shot.prompt.trim()) {
      issues.push(shotIssue(
        shot,
        "missing-prompt",
        "blocking",
        "提示词为空，无法交付到出图或出视频平台",
      ))
    } else if (shot.prompt.length > 1200) {
      issues.push(shotIssue(
        shot,
        "long-prompt",
        "warning",
        `提示词 ${shot.prompt.length} 字，超过 1200 字可读性检查阈值；这不是平台官方限制，请人工确认`,
      ))
    }
    if (
      input.keyframePathByTargetId !== undefined
      && profile.requiresKeyframe
      && !input.keyframePathByTargetId[shot.entityId]
    ) {
      issues.push(shotIssue(
        shot,
        "missing-keyframe",
        "warning",
        `${profile.label} 模式还没有本镜已采用首帧，生成前需要先准备`,
      ))
    }
    if (!isSupportedDuration(shot.params.duration)) {
      issues.push(shotIssue(
        shot,
        "invalid-duration",
        "blocking",
        `时长 ${shot.params.duration} 秒不是 5/10 秒档位，下游平台可能拒收`,
      ))
    }
    if (!SUPPORTED_RATIOS.has(shot.params.ratio)) {
      issues.push(shotIssue(
        shot,
        "invalid-ratio",
        "blocking",
        `画幅 ${shot.params.ratio} 不是 9:16 或 16:9`,
      ))
    }

    for (const name of shot.characters ?? []) {
      const visual = visualsByName.get(name)
      if (!visual?.anchor?.trim()) continue
      if (!shot.prompt.includes(visual.anchor.trim())) {
        issues.push(shotIssue(
          shot,
          "missing-anchor",
          "warning",
          `${name} 的当前角色锚点没有逐字进入 Prompt`,
          name,
        ))
      }
      const traits = missingLockedTraits(shot.prompt, visual)
      if (traits.length > 0) {
        issues.push(shotIssue(
          shot,
          "locked-trait",
          "warning",
          `${name} 缺少禁改项：${traits.map(visualTraitLabel).join("、")}`,
          name,
        ))
      }
    }

    const place = shot.place ? placesByName.get(shot.place) : undefined
    if (place?.anchor?.trim() && !shot.prompt.includes(place.anchor.trim())) {
      issues.push(shotIssue(
        shot,
        "missing-anchor",
        "warning",
        `${place.name} 的当前地点锚点没有逐字进入 Prompt`,
        place.name,
      ))
    }

    if ((shot.missingRefFor ?? []).length > 0) {
      issues.push(shotIssue(
        shot,
        "missing-reference",
        "warning",
        `缺 ${shot.missingRefFor.join("、")} 的参考图`,
      ))
    }

    if (shot.params.lastFrame) {
      const next = shots[index + 1]
      if (!next) {
        issues.push(shotIssue(
          shot,
          "last-shot-chain",
          "warning",
          "勾了接下一镜，但已经是最后一镜",
        ))
      } else if (next.episode !== shot.episode) {
        issues.push(shotIssue(
          shot,
          "cross-episode-chain",
          "warning",
          `下一镜属于第 ${next.episode} 集，确认是否跨集衔接`,
        ))
      }
    }
  })

  return {
    target: input.target,
    blocking: issues.filter((issue) => issue.severity === "blocking").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    issues,
  }
}

function firstFrameInstruction(
  shot: Shot,
  keyframePath: string | null,
  target: PlatformExportTarget,
): string {
  if (keyframePath) return `首帧：${keyframePath}（项目已采用图）`
  if (target === "jimeng") return "首帧：先在即梦生成或上传本镜首帧图"
  if (target === "kling") return "首帧：先在可灵准备本镜首帧图"
  if (target === "jianying") return "首帧：使用本镜已采用图；没有时先回到关键帧生成"
  return "首帧：使用本镜已采用关键帧；没有时先生成"
}

function shotPlatformWorkOrder(
  shot: Shot,
  input: {
    target: PlatformExportTarget
    keyframePath: string | null
  },
): string {
  const episode = shot.episode > 0 ? `第 ${shot.episode} 集 · ` : "集号未标注 · "
  const lines = [
    `【${episode}第 ${shot.shot} 镜】${shot.scene || "场景未标注"}`,
    `提示词：${shot.prompt || "（缺提示词）"}`,
    `参考图：${shot.refImages.length > 0
      ? shot.refImages.join("、")
      : shot.missingRefFor.length > 0
        ? `缺 ${shot.missingRefFor.join("、")}`
        : "无"}`,
    firstFrameInstruction(shot, input.keyframePath, input.target),
    `画幅：${shot.params.ratio}　时长：${shot.params.duration} 秒　景别：${shot.shotSize || "中景"}　运镜：${shot.camera}`,
  ]
  if (shot.params.lastFrame) {
    lines.push("尾帧：从本镜成片末帧导出，作为下一镜首帧")
  }
  if (shot.dialogue) {
    lines.push(`台词：${shot.speaker ? `${shot.speaker}：` : ""}${shot.dialogue}`)
  }
  return lines.join("\n")
}

function buildPlatformWorkList(
  shots: Shot[],
  input: {
    title: string
    target: PlatformExportTarget
    keyframePathByTargetId?: Record<string, string>
    preflight: PlatformPreflight
    ai: AiExportDisclosure
  },
): string {
  if (input.target === "general") {
    const general = shotsToWorkList(shots, `${input.title} · 通用执行清单`)
    return general
  }
  const platform = platformLabel(input.target)
  const usage = input.target === "kling"
    ? "用法：按镜准备首帧；需要衔接时启用首尾帧模式，尾帧来自上一镜成片末帧。"
    : input.target === "jimeng"
      ? "用法：按镜复制提示词并准备参考图；需要衔接时使用首尾帧，尾帧来自上一镜成片末帧。"
      : input.target === "jianying"
        ? "用法：按 shot-order.csv 顺序把已采用关键帧放入剪映；台词以 dialogue.csv 为准。"
      : "用法：供下游工具或自动化脚本读取；本文件不是任何平台的私有 API 请求体。"
  const head = [
    `${input.title} · ${platform}执行清单`,
    `目标：${platform} · 共 ${shots.length} 个镜头`,
    `AI 生成标识：${input.ai.label} · 来源清单：${input.ai.provenancePath}`,
    input.ai.notice,
    `预检：${input.preflight.blocking} 个阻断项，${input.preflight.warning} 个提醒项`,
    "",
    usage,
    "",
    "─".repeat(40),
    "",
  ].join("\n")
  const body = shots.map((shot) => shotPlatformWorkOrder(shot, {
    target: input.target,
    keyframePath: input.keyframePathByTargetId?.[shot.entityId] ?? null,
  })).join("\n\n" + "─".repeat(40) + "\n\n")
  return `${head}${body}\n`
}

function buildCopyPrompts(shots: Shot[], profile: PlatformProfile): string {
  const head = [
    `${profile.label} · 纯提示词`,
    "按集镜顺序直接复制对应提示词；参考图、首尾帧和参数请查看 shotlist.txt。",
    "",
  ].join("\n")
  const body = shots.map((shot) => {
    const episode = shot.episode > 0 ? `第 ${shot.episode} 集` : "集号未标注"
    return `【${episode} · 第 ${shot.shot} 镜】\n${shot.prompt || "（缺提示词）"}`
  }).join("\n\n" + "─".repeat(40) + "\n\n")
  return `${head}${body}\n`
}

function buildPlatformGuide(profile: PlatformProfile): string {
  return [
    `# ${profile.label} 交付说明`,
    "",
    `使用模式：${profile.mode}`,
    "",
    profile.summary,
    "",
    "## 操作顺序",
    ...profile.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "## 文件",
    "- `copy-prompts.txt`：只有镜头编号与提示词，适合直接粘贴。",
    "- `shotlist.txt`：包含参考图、首帧、参数和衔接说明。",
    "- `preflight.json`：阻断项、提醒项与逐镜定位。",
    "- `manifest.json`：结构化执行参数与平台 Profile。",
    "",
    "## 导出前检查",
    "- 镜头提示词不能为空。",
    "- 画幅和时长必须符合当前交付口径。",
    "- 视频类目标需要先准备本镜首帧。",
    "- 超过 1200 字只是可读性提醒，不代表平台官方限制。",
    "- 不使用 Authorization、API Key 或任何未经核实的私有 API 字段。",
    "",
  ].join("\n")
}

function platformShots(
  shots: Shot[],
  keyframePathByTargetId: Record<string, string>,
): PlatformExportShot[] {
  return shots.map((shot) => ({
    episode: shot.episode,
    shot: shot.shot,
    entityId: shot.entityId,
    scene: shot.scene,
    place: shot.place,
    characters: shot.characters,
    prompt: shot.prompt,
    shotSize: shot.shotSize,
    camera: shot.camera,
    refImages: shot.refImages,
    params: shot.params,
    selectedKeyframe: keyframePathByTargetId[shot.entityId] ?? null,
  }))
}

export function buildPlatformExportKit(input: {
  title: string
  target: PlatformExportTarget
  shots: Shot[]
  visuals?: VisualCharacter[]
  places?: VisualPlace[]
  exportedAt?: number
  keyframePathByTargetId?: Record<string, string>
  ai?: AiExportDisclosure
}): PlatformExportKit {
  const target = readPlatformExportTarget(input.target)
  const exportedAt = input.exportedAt ?? Date.now()
  const keyframePathByTargetId = input.keyframePathByTargetId ?? {}
  const ai = input.ai ?? buildAiExportDisclosure()
  const profile = platformProfile(target)
  const preflight = preflightPlatformExport(input.shots, {
    target,
    visuals: input.visuals,
    places: input.places,
    keyframePathByTargetId,
  })
  const wireShots = platformShots(input.shots, keyframePathByTargetId)
  const manifest: PlatformExportKit["manifest"] = {
    schema: "chengju.platform-export",
    schemaVersion: 1,
    target,
    title: input.title,
    exportedAt,
    shotCount: input.shots.length,
    ai,
    profile,
    preflight,
    shots: wireShots,
  }
  const folder = target === "general" ? "production" : `production/${target}`
  const files: PlatformExportFile[] = [
    {
      path: `${folder}/prompts.csv`,
      kind: "csv",
      content: shotsToCsv(input.shots, { keyframePathByTargetId }),
    },
    {
      path: `${folder}/shotlist.txt`,
      kind: "text",
      content: buildPlatformWorkList(input.shots, {
        title: input.title,
        target,
        keyframePathByTargetId,
        preflight,
        ai,
      }),
    },
    {
      path: `${folder}/preflight.json`,
      kind: "json",
      content: JSON.stringify(preflight, null, 2),
    },
    {
      path: `${folder}/manifest.json`,
      kind: "json",
      content: JSON.stringify(manifest, null, 2),
    },
    {
      path: `${folder}/copy-prompts.txt`,
      kind: "text",
      content: buildCopyPrompts(input.shots, profile),
    },
    {
      path: `${folder}/platform-guide.md`,
      kind: "text",
      content: buildPlatformGuide(profile),
    },
  ]
  if (target === "json") {
    files.push({
      path: "production/json/shots.json",
      kind: "json",
      content: JSON.stringify(manifest, null, 2),
    })
  }
  if (target === "jianying") {
    const delivery = buildJianyingDelivery({
      title: input.title,
      shots: input.shots,
      exportedAt,
      keyframePathByTargetId,
    })
    files.push(...delivery.files)
  }
  return {
    target,
    shotCount: input.shots.length,
    preflight,
    files,
    manifest,
  }
}
