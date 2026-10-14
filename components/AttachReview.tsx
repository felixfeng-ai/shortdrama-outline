'use client'

// 挂接结果复核面板。
//
// 解决的是「静默失败」：扫完文件夹之后，用户必须能一眼看到三件事——
//   1. 挂上了几张 / 挂给谁了（以及是靠什么认出来的）
//   2. 谁的图没挂上（这是要去处理的待办，不能藏起来）
//   3. 算法真认不出来时，有一个显式的「让 AI 猜」入口
//
// AI 只吃「文件名字符串」，返回的也只是建议——逐条确认才落到角色上。
import CharacterThumb from './CharacterThumb'
import type { AttachSummary, MatchHit, VaultFile } from '@/lib/assets/vault'

interface Suggestion {
  character: string
  key: string
  confidence: 'high' | 'low'
  reason: string
}

interface Props {
  summary: AttachSummary | null
  detail: Record<string, MatchHit[]>
  vaultFiles: VaultFile[]
  attached: Record<string, string[]>
  unmatched: string[]
  suggestions: Suggestion[]
  note: string | null
  busy: boolean
  onAskAi: () => void
  onAccept: (s: Suggestion) => void
  onDismiss: (key: string) => void
}

export default function AttachReview({
  summary, detail, vaultFiles, attached, unmatched, suggestions, note, busy, onAskAi, onAccept, onDismiss,
}: Props) {
  const total = vaultFiles.length
  const hung = Object.values(attached).reduce((n, keys) => n + keys.length, 0)
  const byName = Object.entries(attached).filter(([, keys]) => keys.length > 0)

  // 有没有「算法看不出归属」的图（纯时间戳命名），有才提示 AI 入口值得点
  const hasUninformative = vaultFiles.some((f) => {
    const shown = Object.values(attached).some((keys) => keys.includes(f.key))
    if (shown) return false
    const clean = f.name.toLowerCase().replace(/[0-9\s_.\-]/g, '')
    return clean.length < 2
  })

  return (
    <div className="rounded-card border border-surface-line bg-surface-card p-4 shadow-surface">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-900">图库匹配结果</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
            扫描时自动按「中文名 / 拼音 / 首字母」把图和角色对上，不用改名。图不上传。
          </p>
        </div>
        <span className="shrink-0 rounded-chip bg-done-100 px-1.5 py-0.5 text-[10px] font-semibold text-done-700">
          图上不出门
        </span>
      </div>

      {/* 汇总条 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-chip bg-surface px-3 py-2 text-xs">
        <span className="text-ink-600">
          共 <b className="text-ink-900">{total}</b> 张 · 已对上{' '}
          <b className="text-done-700">{hung}</b> 张
        </span>
        {summary && (
          <span className="text-ink-400">
            {summary.byKind.zh > 0 && <>中文名 {summary.byKind.zh} </>}
            {summary.byKind.py > 0 && <>拼音 {summary.byKind.py} </>}
            {summary.byKind.ini > 0 && <>首字母 {summary.byKind.ini} </>}
            {summary.byKind.fuzzy > 0 && <>相近 {summary.byKind.fuzzy} </>}
          </span>
        )}
      </div>

      {/* 已挂明细 */}
      {byName.length > 0 && (
        <ul className="mt-3 space-y-2">
          {byName.map(([name, keys]) => (
            <li key={name} className="flex items-center gap-3">
              <CharacterThumb keys={keys} name={name} max={1} className="h-12 w-12" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink-800">{name}</p>
                <p className="truncate text-[11px] text-ink-400">
                  {keys.length} 张 ·
                  {detail[name]?.[0]?.kind === 'zh'
                    ? ' 按中文名匹配'
                    : detail[name]?.[0]?.kind === 'py'
                      ? ' 按拼音匹配'
                      : detail[name]?.[0]?.kind === 'ini'
                        ? ' 按首字母匹配'
                        : ' 按相近名字匹配'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 没挂上的角色 —— 这是待办，必须显眼 */}
      {unmatched.length > 0 && (
        <div className="mt-3 rounded-chip border border-accent-200 bg-accent-50 px-3 py-2">
          <p className="text-xs font-medium text-accent-900">
            还没对上的角色：{unmatched.join('、')}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-accent-800/80">
            这些角色的图要么还没放进文件夹，要么命名里没有线索。可以到下面「角色视觉定妆」里手动挂。
          </p>
        </div>
      )}

      {/* AI 兜底入口 —— 只在真的有认不出的图时出现 */}
      {(hasUninformative || unmatched.length > 0) && (
        <div className="mt-3 rounded-card border border-done-200 bg-done-50/60 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-done-800">
              名字里没有线索？（比如「即梦_19700101.png」这种时间戳命名）
            </p>
            <button
              type="button"
              onClick={onAskAi}
              disabled={busy}
              className="shrink-0 rounded-chip bg-done-600 px-3 py-1.5 text-xs font-medium text-white
                transition-colors hover:bg-done-700 disabled:opacity-50"
            >
              {busy ? 'AI 正在认…' : '让 AI 认一下这些图'}
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-done-700/80">
            只把<b>文件名</b>发给 AI 判断归属，<b>图片本身不会上传</b>。返回的建议要你逐条确认才生效。
          </p>
        </div>
      )}

      {note && <p className="mt-2 text-[11px] text-ink-500">{note}</p>}

      {/* AI 建议：逐条确认 */}
      {suggestions.length > 0 && (
        <ul className="mt-3 space-y-2">
          {suggestions.map((sug) => (
            <li
              key={sug.key}
              className="flex flex-wrap items-center gap-2 rounded-chip border border-surface-line bg-surface/70 px-2.5 py-2"
            >
              <CharacterThumb keys={[sug.key]} name={sug.character} className="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-ink-700">
                  <b className="text-ink-900">{sug.character}</b>
                  {sug.confidence === 'low' && (
                    <span className="ml-1.5 rounded-chip bg-accent-100 px-1 text-[10px] font-medium text-accent-800">
                      不太确定
                    </span>
                  )}
                </p>
                <p className="truncate text-[10px] text-ink-400" title={sug.key}>
                  {sug.reason || sug.key.split('/').pop()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onAccept(sug)}
                className="shrink-0 rounded-chip bg-ink-900 px-2 py-1 text-[11px] font-medium text-surface-card
                  transition-colors hover:bg-ink-700"
              >
                挂上
              </button>
              <button
                type="button"
                onClick={() => onDismiss(sug.key)}
                className="shrink-0 rounded-chip border border-surface-line px-2 py-1 text-[11px] text-ink-500
                  transition-colors hover:bg-surface-deep"
              >
                忽略
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
