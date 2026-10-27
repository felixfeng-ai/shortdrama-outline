// 打包带走（SDD v0.2 E1-E3，原则 P2「账本可带走」）。
//
// 产出一个自包含的项目包，用户拿到后：
//   - 离线可看（storyboard.html 无外链依赖）
//   - 可直接喂出图工具（prompts.csv）
//   - 保留完整血缘与版本（project.json）
//
// 注意：zip 不引入任何第三方库。自己写一个最小的 ZIP（store 模式，不压缩），
// 因为项目已经有「零新增依赖」的惯例（测试框架也是这么处理的）。
import type { Shot, VisualCharacter, VisualPlace, Scene } from './types'
import type { LookBook } from '../look'
import { placeGenerationTargetId } from './anchors'
export {
  PROJECT_PACKAGE_SCHEMA,
  PROJECT_PACKAGE_SCHEMA_VERSION,
  buildProjectPackageManifest,
} from '../export/package'
export type {
  ProjectExportMode,
  ProjectExportFile,
  ProjectExportMissing,
  ProjectExportReport,
  ProjectPackageManifest,
  ProjectPackageSettings,
} from '../export/package'

/**
 * 项目包是用户带走的长期契约，不是内部临时数据结构。
 * 读取器必须用 schemaVersion 分支，不能靠字段是否碰巧存在来猜版本。
 */
/**
 * 单个镜头的「执行单」文本。
 *
 * 为什么需要它：出图平台都没有「导入项目包」的入口，操作模型只有
 * 「在网页上填提示词 + 传参考图 → 生成」。所以工具能做的极限不是省掉操作，
 * 而是让用户去平台时不用回头找信息 —— 从「找信息」变成「照单执行」。
 *
 * 顺序刻意按平台界面的填写顺序排：先提示词（最长、最常复制），
 * 再参考图（要按文件名去本地找），最后参数。
 */
export function shotToWorkOrder(shot: Shot, opts: { withHeader?: boolean } = {}): string {
  const lines: string[] = []

  if (opts.withHeader !== false) {
    // 集号必须出现在抬头里：一部剧几十上百镜，没有集号就分不清这一镜属于哪一集
    const ep = shot.episode > 0 ? `第 ${shot.episode} 集 · ` : "集号未标注 · "
    lines.push(`【${ep}第 ${shot.shot} 镜】${shot.scene}`)
  }
  lines.push(`提示词：${shot.prompt}`)

  if (shot.characters.length > 0) {
    lines.push(`出场：${shot.characters.join("、")}`)
  }

  // 台词不进即梦的表单，但配音和字幕要照着它做——纯画面镜头不写这行
  if (shot.dialogue) {
    lines.push(`台词：${shot.speaker ? `${shot.speaker}：` : ""}${shot.dialogue}`)
  }

  if (shot.refImages.length > 0) {
    lines.push(`参考图：${shot.refImages.join("、")}`)
  } else if (shot.missingRefFor.length > 0) {
    // 缺图必须显式写出来：照着执行时才发现没图，比提前知道代价大得多
    lines.push(`参考图：⚠️ 缺 ${shot.missingRefFor.join("、")} 的参考图`)
  }

  lines.push(`景别：${shot.shotSize || '中景'}　运镜：${shot.camera}　比例：${shot.params.ratio}　时长：${shot.params.duration}s`)

  return lines.join("\n")
}

/**
 * 全片执行清单：一次拿到所有镜头的工作单，配合平台逐个执行。
 *
 * 用分隔线而不是紧凑排列，是因为用户会「执行完一个划掉一个」，
 * 视觉边界比省行重要。
 */
export function shotsToWorkList(shots: Shot[], title = "分镜执行清单"): string {
  const head = [
    title,
    `共 ${shots.length} 个镜头`,
    "",
    "用法：按顺序执行，每镜复制提示词到出图/出视频平台，按「参考图」一栏准备好对应图片。",
    "",
    "─".repeat(40),
    "",
  ].join("\n")

  const body = shots.map((s) => shotToWorkOrder(s)).join("\n\n" + "─".repeat(40) + "\n\n")
  return head + body + "\n"
}

/**
 * 首尾帧衔接清单（SDD E7-E9）。
 *
 * 解决什么：出图平台的首尾帧模式要「首帧 + 尾帧」两张图，中间过渡由模型补。
 * 同一场戏里相邻的两镜，把上一镜的尾帧交给下一镜当首帧，衔接就是模型算出来的，
 * 而不是剪辑台上硬切出来的——这是把「一堆片段」变成「一部剧」的那道接缝。
 *
 * 为什么以「勾选」为准而不是自动推导：该不该接是创作判断，不是数据推断。
 * 一镜一镜自动接满，出来的是一镜到底的怪东西。工具只做两件事：
 * 把勾过的关系变成一份能照着执行的清单；把可能接不上的地方提前说出来。
 *
 * 配对按数组顺序（i 与 i+1），不是按 shot 数字：镜号是给人看的，
 * 删掉一镜之后它可能不再连续，而文档顺序永远是对的。
 */
export function shotsToChainingList(shots: Shot[], title = "首尾帧衔接清单"): string {
  const RULE = "─".repeat(40)
  const chains: string[] = []
  const warnings: string[] = []
  const involved = new Set<number>()

  shots.forEach((s, i) => {
    if (!s.params?.lastFrame) return

    const next = shots[i + 1]
    if (!next) {
      warnings.push(`⚠️ 第 ${s.shot} 镜勾了「接下一镜首帧」，但它已经是最后一镜，没有下一镜可接。`)
      return
    }

    involved.add(s.shot)
    involved.add(next.shot)

    // 尾帧复用上一镜的成片末帧，所以文件名也要能一眼对上镜号
    const endName = `chaining/第${String(s.shot).padStart(2, "0")}镜-末帧.png`
    const lines = [
      `【衔接 ${chains.length + 1}】第 ${s.shot} 镜 → 第 ${next.shot} 镜`,
      `  场景：${next.scene}`,
      `  尾帧：从第 ${s.shot} 镜成片的最后一帧导出 → 存为 ${endName}`,
      `  第 ${next.shot} 镜首帧：用上面这张图`,
    ]

    // scene 是模型生成的短标识，可能不稳定，所以这里只提示、不阻断
    if (s.scene !== next.scene) {
      lines.push(`  ⚠️ 两镜场景标签不同（${s.scene} / ${next.scene}）——跨场通常应当硬切，确认是否真要衔接`)
    }
    if (next.missingRefFor?.length) {
      lines.push(`  ⚠️ 第 ${next.shot} 镜缺 ${next.missingRefFor.join("、")} 的参考图，首帧可能接不上`)
    }

    lines.push(`  第 ${next.shot} 镜提示词：${next.prompt}`)
    chains.push(lines.join("\n"))
  })

  if (chains.length === 0) {
    const out = [title, "", "共 0 处衔接", ""]
    out.push(
      warnings.length === 0
        ? "还没有标记任何衔接。在分镜卡上勾「接下一镜首帧」，这里就会列出该导出的尾帧与衔接顺序。"
        : warnings.join("\n"),
    )
    return out.join("\n").trimEnd() + "\n"
  }

  const head = [
    title,
    `共 ${chains.length} 处衔接 · 涉及 ${involved.size} 个镜头`,
    "",
    "用法：在出图平台选「首尾帧」模式（即梦、可灵等都支持），上传首帧与尾帧两张图，中间过渡由模型补。",
    "    每处衔接的尾帧，从上一镜成片的最后一帧导出即可。",
  ].join("\n")

  const body = chains.join("\n\n" + RULE + "\n\n")
  const tail = warnings.length > 0 ? "\n\n" + RULE + "\n\n" + warnings.join("\n") : ""
  return head + "\n\n" + RULE + "\n\n" + body + tail + "\n"
}

/** 镜头 -> CSV。服务端与前端共用同一份实现，避免两份逻辑漂移 */
export function shotsToCsv(
  shots: Shot[],
  options: { keyframePathByTargetId?: Record<string, string> } = {},
): string {
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`
  const head = [
    '镜号', '集号', '场景', '地点', '出场角色', '动作', '说话人', '台词',
    '景别', '运镜', '提示词', '参考图', '缺失参考', '接下一镜首帧',
    '画面比例', '时长', '状态', '镜头实体 ID', '已采用图路径',
  ]
  const rows = shots.map((s) => [
    s.shot, s.episode > 0 ? s.episode : '', s.scene, s.place, s.characters.join('、'), s.action, s.speaker, s.dialogue,
    s.shotSize || '中景', s.camera,
    s.prompt, s.refImages.join(' | '), s.missingRefFor.join('、'),
    s.params.lastFrame ? '是' : '否', s.params.ratio, s.params.duration, s.status,
    s.entityId, options.keyframePathByTargetId?.[s.entityId] ?? '',
  ].map(esc).join(','))
  return '\ufeff' + [head.map(esc).join(','), ...rows].join('\n') + '\n'
}

/** 逃生 HTML 实体，防止剧情文本破坏页面结构 */
function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/** 离线可看的分镜表。样式内联，不依赖任何外链（E1 断言点） */
export function buildStoryboardHtml(input: {
  title: string
  visuals: VisualCharacter[]
  places?: VisualPlace[]
  look?: LookBook
  scenes: Scene[]
  shots: Shot[]
  images?: StoryboardImage[]
}): string {
  const { title, visuals, places = [], look, scenes, shots, images = [] } = input
  const imageByTarget = new Map(images.map((image) => [`${image.targetType}:${image.targetId}`, image]))
  const imageMarkup = (targetType: StoryboardImage["targetType"], targetId: string, alt: string) => {
    const image = imageByTarget.get(`${targetType}:${targetId}`)
    if (!image) return '<span class="dim">—</span>'
    return `<img class="thumb" src="../${esc(image.path)}" alt="${esc(image.alt || alt)}" width="120" height="68" loading="lazy">`
  }

  const visualRows = visuals.map((v) => `
    <tr><td>${esc(v.name)}</td><td class="mono">${esc(v.anchor)}</td><td>${imageMarkup("character", v.entityId ?? v.id, `${v.name}角色定妆`)}</td></tr>`).join('')

  const placeRows = places.map((place) => `
    <tr><td>${esc(place.name)}</td><td class="mono">${esc(place.anchor)}</td><td>${imageMarkup("place", placeGenerationTargetId(place.name), `${place.name}场景图`)}</td></tr>`).join('')

  const sceneRows = scenes.map((s) => `
    <tr><td>${s.number}</td><td>${s.episode}</td><td>${esc(s.location)}</td><td>${esc(s.timeOfDay)}</td>
    <td>${esc(s.characters.join('、'))}</td><td>${esc(s.summary)}</td></tr>`).join('')

  const shotRows = shots.map((s) => `
    <tr>
      <td>${imageMarkup("shot", s.entityId, `第 ${s.shot} 镜首帧`)}</td>
      <td>${s.shot}</td>
      <td>${s.episode > 0 ? s.episode : '—'}</td>
      <td>${esc(s.scene)}</td>
      <td>${esc(s.characters.join('、'))}</td>
      <td>${esc(s.action)}</td>
      <td>${esc(s.dialogue) ? `${esc(s.speaker)}${s.speaker ? '：' : ''}${esc(s.dialogue)}` : '<span class="dim">—</span>'}</td>
      <td>${esc(s.shotSize || '中景')}</td>
      <td>${esc(s.camera)}</td>
      <td>${esc(s.params.ratio)} / ${s.params.duration}s</td>
      <td>${esc(shotStatusLabel(s.status))}</td>
      <td>${esc(s.refImages.join(' | ')) || '<span class="warn">缺参考图</span>'}</td>
      <td class="mono">${esc(s.prompt)}</td>
    </tr>`).join('')

  const lookRows = look
    ? [
      ["色调", look.palette],
      ["光线", look.light],
      ["镜头语言", look.lens],
      ["不要出现", look.banned],
    ].filter(([, value]) => value).map(([label, value]) =>
      `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`).join('')
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · 分镜表</title>
<style>
  body { font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
         margin: 0; padding: 32px; background: #f8fafc; color: #1e293b; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  h2 { font-size: 15px; margin: 28px 0 10px; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; background: #fff;
          border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 13px; }
  th { background: #f1f5f9; text-align: left; padding: 8px 10px; font-weight: 600;
       border-bottom: 1px solid #e2e8f0; white-space: nowrap; }
  td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 12px; color: #334155; }
  .warn { color: #b45309; background: #fef3c7; padding: 1px 6px; border-radius: 4px; font-size: 11px; }
  .dim { color: #94a3b8; }
  .thumb { display: block; width: 120px; height: 68px; object-fit: cover; border-radius: 4px; background: #e2e8f0; }
  footer { margin-top: 32px; color: #94a3b8; font-size: 12px; }
</style>
</head>
<body>
  <h1>${esc(title)} · 分镜表</h1>
  <p class="meta">导出时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}　·　共 ${shots.length} 个镜头 / ${scenes.length} 场 / ${visuals.length} 个角色</p>

  ${visuals.length ? `<h2>角色视觉锚点</h2><table><thead><tr><th>角色</th><th>英文锚点（逐镜复用）</th><th>采用图</th></tr></thead><tbody>${visualRows}</tbody></table>` : ''}

  ${places.length ? `<h2>地点视觉锚点</h2><table><thead><tr><th>地点</th><th>英文锚点（逐镜复用）</th><th>场景图</th></tr></thead><tbody>${placeRows}</tbody></table>` : ''}

  ${lookRows ? `<h2>视觉宪法</h2><table class="look"><tbody>${lookRows}</tbody></table>` : ''}

  ${scenes.length ? `<h2>场景</h2><table><thead><tr><th>#</th><th>集号</th><th>地点</th><th>时间</th><th>出场</th><th>内容</th></tr></thead><tbody>${sceneRows}</tbody></table>` : ''}

  ${shots.length ? `<h2>分镜</h2><table><thead><tr><th>首帧</th><th>镜</th><th>集号</th><th>场景</th><th>出场</th><th>动作</th><th>台词</th><th>景别</th><th>运镜</th><th>画幅 / 时长</th><th>状态</th><th>本镜参考图</th><th>提示词</th></tr></thead><tbody>${shotRows}</tbody></table>` : ''}

  <footer>由「成剧」导出 —— 本文件不依赖任何外部资源，可离线打开。</footer>
</body>
</html>`
}

export interface StoryboardImage {
  path: string
  targetType: "character" | "place" | "shot"
  targetId: string
  alt: string
}

function shotStatusLabel(status: Shot["status"]): string {
  if (status === "done") return "已出图"
  if (status === "rework") return "需返修"
  return "待出图"
}

// ── 最小 ZIP 打包（store 模式，不压缩）──────────────────────────

function crc32(bytes: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

interface ZipEntry { name: string; data: Uint8Array }

/** 构造一个 ZIP（store，无压缩）。文件不大，够用且零依赖 */
export function buildZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  const now = new Date()
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + nameBytes.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)          // version needed
    lv.setUint16(6, 0x0800, true)      // UTF-8 flag
    lv.setUint16(8, 0, true)           // store
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)

    chunks.push(local, entry.data)

    const cd = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    cd.set(nameBytes, 46)
    central.push(cd)

    offset += local.length + size
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  return new Blob([...chunks, ...central, end] as BlobPart[], { type: 'application/zip' })
}

/** 触发浏览器下载 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export type { ZipEntry }
