// 打包带走（SDD v0.2 E1-E3，原则 P2「账本可带走」）。
//
// 产出一个自包含的项目包，用户拿到后：
//   - 离线可看（storyboard.html 无外链依赖）
//   - 可直接喂出图工具（prompts.csv）
//   - 保留完整血缘与版本（project.json）
//
// 注意：zip 不引入任何第三方库。自己写一个最小的 ZIP（store 模式，不压缩），
// 因为项目已经有「零新增依赖」的惯例（测试框架也是这么处理的）。
import type { Shot, VisualCharacter, Scene } from './types'

export interface ExportManifest {
  project: { id: string; title: string; createdAt: number; updatedAt: number }
  latest: Record<string, { version: number; payload: unknown }>
  refs: unknown[]
  exportedAt: number
}

/** 镜头 -> CSV。服务端与前端共用同一份实现，避免两份逻辑漂移 */
export function shotsToCsv(shots: Shot[]): string {
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`
  const head = ['镜号', '场景', '出场角色', '动作', '运镜', '提示词', '参考图', '画面比例', '时长', '状态']
  const rows = shots.map((s) => [
    s.shot, s.scene, s.characters.join('、'), s.action, s.camera,
    s.prompt, s.refImages.join(' | '), s.params.ratio, s.params.duration, s.status,
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
  scenes: Scene[]
  shots: Shot[]
}): string {
  const { title, visuals, scenes, shots } = input

  const visualRows = visuals.map((v) => `
    <tr><td>${esc(v.name)}</td><td class="mono">${esc(v.anchor)}</td></tr>`).join('')

  const sceneRows = scenes.map((s) => `
    <tr><td>${s.number}</td><td>${esc(s.location)}</td><td>${esc(s.timeOfDay)}</td>
    <td>${esc(s.characters.join('、'))}</td><td>${esc(s.summary)}</td></tr>`).join('')

  const shotRows = shots.map((s) => `
    <tr>
      <td>${s.shot}</td>
      <td>${esc(s.scene)}</td>
      <td>${esc(s.characters.join('、'))}</td>
      <td>${esc(s.action)}</td>
      <td>${esc(s.camera)}</td>
      <td>${esc(s.refImages.join(' | ')) || '<span class="warn">缺参考图</span>'}</td>
      <td class="mono">${esc(s.prompt)}</td>
    </tr>`).join('')

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
  footer { margin-top: 32px; color: #94a3b8; font-size: 12px; }
</style>
</head>
<body>
  <h1>${esc(title)} · 分镜表</h1>
  <p class="meta">导出时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}　·　共 ${shots.length} 个镜头 / ${scenes.length} 场 / ${visuals.length} 个角色</p>

  ${visuals.length ? `<h2>角色视觉锚点</h2><table><thead><tr><th>角色</th><th>英文锚点（逐镜复用）</th></tr></thead><tbody>${visualRows}</tbody></table>` : ''}

  ${scenes.length ? `<h2>场次</h2><table><thead><tr><th>#</th><th>地点</th><th>时间</th><th>出场</th><th>内容</th></tr></thead><tbody>${sceneRows}</tbody></table>` : ''}

  ${shots.length ? `<h2>分镜</h2><table><thead><tr><th>镜</th><th>场景</th><th>出场</th><th>动作</th><th>运镜</th><th>本镜参考图</th><th>提示词</th></tr></thead><tbody>${shotRows}</tbody></table>` : ''}

  <footer>由「成剧」导出 —— 本文件不依赖任何外部资源，可离线打开。</footer>
</body>
</html>`
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
