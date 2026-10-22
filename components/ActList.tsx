'use client'

import { useState } from 'react'
import AutoTextarea from './AutoTextarea'
import { ACT_META, type Act } from '@/lib/types'
import SmoothCollapse from './SmoothCollapse'

interface Props {
  acts: Act[]
  onChange: (next: Act[]) => void
}

// 三幕配色。原来的 sky/amber/rose 三色是「凑齐彩虹」，在纸墨主题里太吵；
// 现在收成「墨色由浅到深」——第一幕还淡，第二幕转深，第三幕用朱砂收束，
// 既保持了结构可辨，又让颜色本身有叙事方向。
const ACCENT: Record<Act['key'], string> = {
  setup: 'bg-ink-50/60',
  conflict: 'bg-surface-deep/60',
  resolution: 'bg-accent-50/70',
}

/** 三幕的固定顺序与简称，用来画那块进度轨 */
const STAGES: { key: Act['key']; label: string }[] = [
  { key: 'setup', label: '铺垫' },
  { key: 'conflict', label: '冲突' },
  { key: 'resolution', label: '结局' },
]

export default function ActList({ acts, onChange }: Props) {
  // 与 demo 一致：默认只展开第一幕，二/三幕是两张小卡，点开才编辑
  const [open, setOpen] = useState<Record<string, boolean>>({})

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
    <div className="ledger-list">
      {acts.map((act, index) => {
        const meta = ACT_META[act.key] ?? ACT_META.setup
        const expanded = open[act.id] ?? index === 0

        return (
          <article
            key={act.id}
            className={`actcard ledger-row act-shell ${expanded ? 'is-expanded' : 'is-collapsed'} ${ACCENT[act.key] ?? ACCENT.setup}`}
          >
            <button
              type="button"
              className="act-shell-head"
              aria-expanded={expanded}
              aria-disabled={index === 0}
              onClick={() => index > 0 && setOpen((o) => ({ ...o, [act.id]: !expanded }))}
            >
              <h3>{meta.label}</h3>
              {index > 0 && (
                <span className="act-shell-toggle">{expanded ? '收起' : '展开'}</span>
              )}
            </button>

            <SmoothCollapse open={expanded}>
            <div className="act-shell-body">
            {/* 三幕进度轨：与 demo 同一套（圆点 + 铺垫→冲突→结局 + 细轨 + 收束点） */}
            <div className="steps">
              <span aria-hidden="true" className="dot" />
              <span>
                {STAGES.map((stage) => (
                  <span key={stage.key} className="flex items-center gap-1.5">
                    <span className={stage.key === act.key ? 'font-semibold' : ''}>{stage.label}</span>
                    {stage.key !== 'resolution' && <span aria-hidden="true">→</span>}
                  </span>
                ))}
              </span>
              <span aria-hidden="true" className="rail" />
              <span aria-hidden="true" className="dot glow" />
            </div>

            {/* 幕的剧情梗概 */}
            <AutoTextarea
              value={act.summary}
              onChange={(summary) => update(act.id, { summary })}
              ariaLabel={`${meta.label} 剧情梗概`}
              placeholder="这一幕的剧情梗概"
              className="prose w-full resize-none border-0 focus:outline-none"
            />

            {/* 情节点 */}
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-400">关键情节点</p>
              <ul className="space-y-1">
                {act.beats.map((beat, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-300" />
                    <AutoTextarea
                      value={beat}
                      onChange={(value) => updateBeat(act.id, i, value)}
                      ariaLabel={`${meta.label} 第 ${i + 1} 个情节点`}
                      placeholder="补充一个情节点"
                      className="text-sm leading-relaxed text-ink-600"
                    />
                    <button
                      type="button"
                      onClick={() => removeBeat(act.id, i)}
                      aria-label={`删除第 ${i + 1} 个情节点`}
                      // 默认就可见：触屏没有 hover，靠 group-hover 显形等于这个按钮不存在
                      className="mt-1 shrink-0 rounded-chip p-2 text-ink-200 transition-colors hover:bg-surface-card
                        hover:text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
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
                className="mt-1.5 rounded-chip px-2 py-1 text-xs text-ink-400 transition-colors hover:bg-surface-card
                  hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
              >
                + 添加情节点
              </button>
            </div>
            </div>
            </SmoothCollapse>
          </article>
        )
      })}
    </div>
  )
}
