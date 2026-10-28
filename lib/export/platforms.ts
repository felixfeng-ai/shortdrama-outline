import {
  isSupportedDuration,
  type Shot,
  type VisualCharacter,
  type VisualPlace,
} from "../assets/types.ts"
import { missingLockedTraits, visualTraitLabel } from "../assets/anchors.ts"
import { shotsToCsv, shotsToWorkList } from "../assets/export.ts"

export const PLATFORM_EXPORT_TARGETS = ["general", "jimeng", "kling", "json"] as const
export type PlatformExportTarget = (typeof PLATFORM_EXPORT_TARGETS)[number]

export type PlatformPreflightCode =
  | "invalid-duration"
  | "invalid-ratio"
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
    preflight: PlatformPreflight
    shots: PlatformExportShot[]
  }
}

const PLATFORM_LABELS: Record<PlatformExportTarget, string> = {
  general: "通用",
  jimeng: "即梦",
  kling: "可灵",
  json: "结构化 JSON",
}

const SUPPORTED_RATIOS = new Set(["9:16", "16:9"])

export function platformLabel(target: PlatformExportTarget): string {
  return PLATFORM_LABELS[target]
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
  },
): PlatformPreflight {
  const visualsByName = new Map((input.visuals ?? []).map((visual) => [visual.name, visual]))
  const placesByName = new Map((input.places ?? []).map((place) => [place.name, place]))
  const issues: PlatformPreflightIssue[] = []

  shots.forEach((shot, index) => {
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
  },
): string {
  if (input.target === "general") {
    return shotsToWorkList(shots, `${input.title} · 通用执行清单`)
  }
  const platform = platformLabel(input.target)
  const usage = input.target === "kling"
    ? "用法：按镜准备首帧；需要衔接时启用首尾帧模式，尾帧来自上一镜成片末帧。"
    : input.target === "jimeng"
      ? "用法：按镜复制提示词并准备参考图；需要衔接时使用首尾帧，尾帧来自上一镜成片末帧。"
      : "用法：供下游工具或自动化脚本读取；本文件不是任何平台的私有 API 请求体。"
  const head = [
    `${input.title} · ${platform}执行清单`,
    `目标：${platform} · 共 ${shots.length} 个镜头`,
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
}): PlatformExportKit {
  const target = readPlatformExportTarget(input.target)
  const exportedAt = input.exportedAt ?? Date.now()
  const keyframePathByTargetId = input.keyframePathByTargetId ?? {}
  const preflight = preflightPlatformExport(input.shots, {
    target,
    visuals: input.visuals,
    places: input.places,
  })
  const wireShots = platformShots(input.shots, keyframePathByTargetId)
  const manifest: PlatformExportKit["manifest"] = {
    schema: "chengju.platform-export",
    schemaVersion: 1,
    target,
    title: input.title,
    exportedAt,
    shotCount: input.shots.length,
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
  ]
  if (target === "json") {
    files.push({
      path: "production/json/shots.json",
      kind: "json",
      content: JSON.stringify(manifest, null, 2),
    })
  }
  return {
    target,
    shotCount: input.shots.length,
    preflight,
    files,
    manifest,
  }
}
