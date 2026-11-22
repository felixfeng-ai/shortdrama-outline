import type { Shot } from "../assets/types.ts"

const MAX_BATCH_FILES = 20
const MAX_VIDEO_BYTES = 80 * 1024 * 1024

export interface ExternalVideoFileMeta {
  index: number
  name: string
  size: number
  type: string
}

export interface ExternalVideoMapping {
  fileIndex: number
  fileName: string
  targetId: string
  episode: number
  shot: number
  shotId: string
  label: string
}

export interface ExternalVideoImportIssue {
  fileIndex: number
  fileName: string
  reason: string
}

export interface ExternalVideoImportPlan {
  mapped: ExternalVideoMapping[]
  issues: ExternalVideoImportIssue[]
}

export function parseExternalVideoFilename(
  name: string,
): { episode: number; shot: number } | null {
  const fileName = name.replaceAll("\\", "/").split("/").at(-1) ?? ""
  if (!/\.mp4$/i.test(fileName)) return null
  const base = fileName.replace(/\.mp4$/i, "").trim()
  const patterns = [
    /^(?:e|ep|episode)[\s_-]*0*(\d+)[\s_-]*(?:s|shot|镜)[\s_-]*0*(\d+)$/i,
    /^0*(\d+)[\s_-]+0*(\d+)$/,
    /^第\s*0*(\d+)\s*集[\s_-]*第?\s*0*(\d+)\s*镜?$/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(base)
    if (!match) continue
    const episode = Number(match[1])
    const shot = Number(match[2])
    if (episode > 0 && shot > 0) return { episode, shot }
  }
  return null
}

/**
 * 批量回传先做纯本地映射，用户确认前不读取或上传文件内容。
 * 同名镜头、无法识别的文件名和非法格式都保留为预览问题，不能静默猜测。
 */
export function planExternalVideoImport(input: {
  shots: Shot[]
  files: ExternalVideoFileMeta[]
  manualTargets?: Record<number, string>
}): ExternalVideoImportPlan {
  const issues: ExternalVideoImportIssue[] = []
  const candidates: ExternalVideoMapping[] = []
  const limited = new Set(
    input.files.slice(MAX_BATCH_FILES).map((file) => file.index),
  )

  for (const file of input.files) {
    if (limited.has(file.index)) {
      issues.push({
        fileIndex: file.index,
        fileName: file.name,
        reason: `一次最多导入 ${MAX_BATCH_FILES} 个视频`,
      })
      continue
    }
    if (file.type.toLowerCase() !== "video/mp4") {
      issues.push({
        fileIndex: file.index,
        fileName: file.name,
        reason: "只支持 MP4 文件",
      })
      continue
    }
    if (file.size <= 0 || file.size > MAX_VIDEO_BYTES) {
      issues.push({
        fileIndex: file.index,
        fileName: file.name,
        reason: file.size <= 0 ? "文件为空" : "文件不能超过 80MB",
      })
      continue
    }
    const manualTargetId = input.manualTargets?.[file.index]?.trim()
    const manualShot = manualTargetId
      ? input.shots.find((item) =>
          item.id === manualTargetId || item.entityId === manualTargetId
        )
      : null
    if (manualTargetId && !manualShot) {
      issues.push({
        fileIndex: file.index,
        fileName: file.name,
        reason: "手动选择的镜头不存在",
      })
      continue
    }
    const parsed = manualShot ? null : parseExternalVideoFilename(file.name)
    if (!manualShot && !parsed) {
      issues.push({
        fileIndex: file.index,
        fileName: file.name,
        reason: "无法识别文件名中的集号和镜号",
      })
      continue
    }
    const shot = manualShot ?? input.shots.find((item) =>
      item.episode === parsed!.episode && item.shot === parsed!.shot
    )
    if (!shot) {
      issues.push({
        fileIndex: file.index,
        fileName: file.name,
        reason: `项目中不存在第 ${parsed!.episode} 集第 ${parsed!.shot} 镜`,
      })
      continue
    }
    candidates.push({
      fileIndex: file.index,
      fileName: file.name,
      targetId: shot.entityId ?? shot.id,
      episode: shot.episode,
      shot: shot.shot,
      shotId: shot.id,
      label: `第 ${shot.episode} 集 · 镜 ${String(shot.shot).padStart(2, "0")}`,
    })
  }

  const grouped = new Map<string, ExternalVideoMapping[]>()
  for (const candidate of candidates) {
    const current = grouped.get(candidate.targetId) ?? []
    current.push(candidate)
    grouped.set(candidate.targetId, current)
  }
  const mapped: ExternalVideoMapping[] = []
  for (const group of grouped.values()) {
    if (group.length === 1) {
      mapped.push(group[0]!)
      continue
    }
    for (const item of group) {
      issues.push({
        fileIndex: item.fileIndex,
        fileName: item.fileName,
        reason: `重复匹配同一镜头：${item.label}`,
      })
    }
  }
  mapped.sort((left, right) => left.episode - right.episode || left.shot - right.shot)
  issues.sort((left, right) => left.fileIndex - right.fileIndex)
  return { mapped, issues }
}
