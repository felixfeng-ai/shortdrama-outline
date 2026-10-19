'use client'

// 导演意图卡：4 个字段，可跳过。空着时对生成零影响。
import { useState } from 'react'
import { isBriefEmpty, type CreativeBrief } from '@/lib/brief'

interface Props {
  value: CreativeBrief
  onChange: (next: CreativeBrief) => void
  /** 由外部 meta 条控制开合 */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** 只渲染展开后的表单，不画自己的头部 */
  headless?: boolean
}

const EMOTIONS = ['克制', '温柔', '荒诞', '热烈', '冷峻']
const AUDIENCES = ['18-24 女性', '25-35 女性', '25-40 男性', '全年龄']

export default function BriefCard({ value, onChange, open: controlled, onOpenChange, headless = false }: Props) {
  const [inner, setInner] = useState(false)
  const open = controlled ?? inner
  const setOpen = onOpenChange ?? setInner
  const filled = !isBriefEmpty(value)
  const summary = [value.emotion, value.audience, value.references].filter(Boolean).join(' · ')

  const set = (patch: Partial<CreativeBrief>) => onChange({ ...value, ...patch })

  const body = open ? (
    <div className={headless ? 'workmeta-panel' : 'brief-body'}>
          <div className="brief-row">
            <span className="brief-label">核心情绪</span>
            <div className="brief-chips">
              {EMOTIONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={value.emotion === item}
                  className={value.emotion === item ? 'on' : ''}
                  onClick={() => set({ emotion: value.emotion === item ? '' : item })}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="brief-row">
            <span className="brief-label">目标观众</span>
            <div className="brief-chips">
              {AUDIENCES.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={value.audience === item}
                  className={value.audience === item ? 'on' : ''}
                  onClick={() => set({ audience: value.audience === item ? '' : item })}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="brief-row">
            <span className="brief-label">参考气质</span>
            <input
              value={value.references}
              onChange={(e) => set({ references: e.target.value })}
              placeholder="参考片 / 气质，最多 3 个，用顿号分隔"
              maxLength={60}
              aria-label="参考气质"
            />
          </div>

          <div className="brief-row">
            <span className="brief-label">不要变成</span>
            <input
              value={value.redline}
              onChange={(e) => set({ redline: e.target.value })}
              placeholder="红线，一句就够（例如：不要爽剧式打脸）"
              maxLength={100}
              aria-label="不想变成什么"
            />
          </div>

          <div className="brief-actions">
            <span className="brief-hint">可跳过；空着时与原来的生成完全一致</span>
            <button type="button" onClick={() => setOpen(false)}>完成</button>
          </div>
    </div>
  ) : null

  if (headless) return body

  return (
    <div className="brief">
      <button
        type="button"
        className="brief-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="brief-dot" aria-hidden="true" />
        <span className="brief-title">创作意图</span>
        <span className="brief-summary">{filled ? summary : '未填写 · 生成会按平均值走'}</span>
        <span className="brief-toggle">{open ? '收起' : filled ? '编辑' : '填写'}</span>
      </button>
      {body}
    </div>
  )
}
