'use client'

import AutoTextarea from './AutoTextarea'
import { ACT_META, type Act } from '@/lib/types'

interface Props {
  acts: Act[]
  onChange: (next: Act[]) => void
}

// 三幕各自的配色，让结构一眼可辨
const ACCENT: Record<Act['key'], string> = {
  setup: 'border-l-sky-400 bg-sky-50/40',
  conflict: 'border-l-amber-400 bg-amber-50/40',
  resolution: 'border-l-rose-400 bg-rose-50/40',
}

export default function ActList({ acts, onChange }: Props) {
  const update = (id: string, patch: Partial<Act>) =>
    onChange(acts.map((a) => (a.id === id ? { ...a, ...patch } : a)))

  const updateBeat = (id: string, index: number, value: string) => {
    const act = acts.find((a) => a.id === id)
    if (!act) return
    const beats = act.beats.map((b, i) => (i === index ? value : b))
    update(id, { beats })
  }

  const removeBeat = (id: string, index: number) => {
    const act = acts.find((a) => a.id === id)
    if (!act) return
    update(id, { beats: act.beats.filter((_, i) => i !== index) })
  }

  const addBeat = (id: string) => {
    const act = acts.find((a) => a.id === id)
    if (!act) return
    update(id, { beats: [...act.beats, ''] })
  }

  return (
    <div className="space-y-4">
      {acts.map((act) => {
        const meta = ACT_META[act.key] ?? ACT_META.setup

        return (
          <article
            key={act.id}
            className={`rounded-xl border border-slate-200 border-l-4 p-4 sm:p-5 ${ACCENT[act.key] ?? ACCENT.setup}`}
          >
            <div className="mb-2 flex items-baseline gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{meta.label}</h3>
              <span className="text-xs text-slate-500">{meta.hint}</span>
            </div>

            {/* 幕的剧情梗概 */}
            <AutoTextarea
              value={act.summary}
              onChange={(summary) => update(act.id, { summary })}
              ariaLabel={`${meta.label} 剧情梗概`}
              placeholder="这一幕的剧情梗概"
              className="-ml-2 text-sm leading-relaxed text-slate-700"
            />

            {/* 情节点 */}
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium text-slate-500">关键情节点</p>
              <ul className="space-y-1">
                {act.beats.map((beat, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                    <AutoTextarea
                      value={beat}
                      onChange={(value) => updateBeat(act.id, i, value)}
                      ariaLabel={`${meta.label} 第 ${i + 1} 个情节点`}
                      placeholder="补充一个情节点"
                      className="text-sm leading-relaxed text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => removeBeat(act.id, i)}
                      aria-label={`删除第 ${i + 1} 个情节点`}
                      // 默认就可见：触屏没有 hover，靠 group-hover 显形等于这个按钮不存在
                      className="mt-1 shrink-0 rounded p-2 text-slate-300 transition-colors hover:bg-white
                        hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                        <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => addBeat(act.id)}
                className="mt-1.5 rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-white
                  hover:text-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              >
                + 添加情节点
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
