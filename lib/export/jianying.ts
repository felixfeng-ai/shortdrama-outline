import type { Shot } from "../assets/types.ts"

export interface JianyingDeliveryAsset {
  path: string
  kind: "csv" | "text" | "json"
  content: string
}

function csvCell(value: unknown): string {
  const text = String(value ?? "")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return `"${text.replace(/"/g, '""')}"`
}

function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

/**
 * 生成剪映可消费的“中间交付包”。
 *
 * 为什么不直接伪造 .draft 文件夹：剪映草稿格式存在版本差异，字段版本不对时
 * 用户会在导入端看到损坏工程。这里先锁定可验证的顺序、台词、素材映射，
 * 后续若要接私有草稿，只需替换本函数的文件生成层，不改变项目 schema。
 */
export function buildJianyingDelivery(input: {
  title: string
  shots: Shot[]
  exportedAt: number
  keyframePathByTargetId: Record<string, string>
}): { files: JianyingDeliveryAsset[]; manifest: Record<string, unknown> } {
  const ordered = input.shots.slice().sort((left, right) =>
    (left.episode || Number.MAX_SAFE_INTEGER) - (right.episode || Number.MAX_SAFE_INTEGER)
    || left.shot - right.shot
  )
  const shotRows: unknown[][] = [[
    "sequence", "episode", "shot", "entityId", "scene", "durationSeconds", "ratio",
    "firstFrame", "chainToNext", "speaker", "dialogue", "prompt",
  ]]
  const dialogueRows: unknown[][] = [["subtitleIndex", "episode", "shot", "entityId", "speaker", "dialogue"]]
  const manifestShots: Record<string, unknown>[] = []

  ordered.forEach((shot, index) => {
    const selectedKeyframe = input.keyframePathByTargetId[shot.entityId] ?? ""
    shotRows.push([
      index + 1,
      shot.episode,
      shot.shot,
      shot.entityId,
      shot.scene,
      shot.params.duration,
      shot.params.ratio,
      selectedKeyframe,
      shot.params.lastFrame ? "yes" : "no",
      shot.speaker,
      shot.dialogue,
      shot.prompt,
    ])
    if (shot.dialogue.trim()) {
      dialogueRows.push([
        dialogueRows.length,
        shot.episode,
        shot.shot,
        shot.entityId,
        shot.speaker || "旁白",
        shot.dialogue,
      ])
    }
    manifestShots.push({
      sequence: index + 1,
      episode: shot.episode,
      shot: shot.shot,
      entityId: shot.entityId,
      scene: shot.scene,
      durationSeconds: shot.params.duration,
      ratio: shot.params.ratio,
      selectedKeyframe: selectedKeyframe || null,
      chainToNext: shot.params.lastFrame,
      speaker: shot.speaker,
      dialogue: shot.dialogue,
      prompt: shot.prompt,
    })
  })

  const manifest = {
    schema: "chengju.jianying-delivery",
    schemaVersion: 1,
    title: input.title,
    exportedAt: input.exportedAt,
    shotCount: ordered.length,
    dialogueCount: dialogueRows.length - 1,
    mediaPolicy: "关键帧使用项目已采用的生成图；本地参考图像素不进入服务端",
    shots: manifestShots,
  }

  return {
    files: [
      { path: "production/jianying/shot-order.csv", kind: "csv", content: csv(shotRows) },
      { path: "production/jianying/dialogue.csv", kind: "csv", content: csv(dialogueRows) },
      {
        path: "production/jianying/jianying-manifest.json",
        kind: "json",
        content: JSON.stringify(manifest, null, 2),
      },
      {
        path: "production/jianying/README.txt",
        kind: "text",
        content: [
          `${input.title} · 剪映交付说明`,
          "",
          "1. 按 shot-order.csv 的 sequence 顺序把已采用关键帧或视频片段放入剪映时间线。",
          "2. dialogue.csv 只包含有台词的镜头；空台词镜头不会生成伪造字幕。",
          "3. chainToNext=yes 表示需要导出本镜末帧，作为下一镜首帧继续生成。",
          "4. 本交付包是稳定中间格式，不是剪映私有 .draft 工程文件。",
          "5. 本地参考图像素不进入服务端，也不在本交付包中。",
        ].join("\n"),
      },
    ],
    manifest,
  }
}
