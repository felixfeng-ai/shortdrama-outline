'use client'

// 视觉宪法：管"同一部片"的色调、光线、镜头语言与禁区。
// 与角色锚点互补：锚点管脸不换，这里管味道不散。
import { useState } from 'react'
import { isLookEmpty, type LookBook } from '@/lib/look'

interface Props {
  value: LookBook
  onChange: (next: LookBook) => void
}

const FIELDS = [
  { key: 'palette', label: '色调', placeholder: '冷蓝、低饱和 / 暖黄、高对比' },
  { key: 'light', label: '光线', placeholder: '单一暖光源 / 阴天散射光' },
  { key: 'lens', label: '镜头语言', placeholder: '长焦压缩 / 手持轻微晃动' },
  { key: 'banned', label: '不要出现', placeholder: '霓虹、赛博感、过曝' },
] as const

export default function LookBookCard({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const filled = !isLookEmpty(value)
  const summary = [value.palette, value.lens].filter(Boolean).join(' · ')

  return (
    <div className="brief">
      <button
        type="button"
        className="brief-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="brief-dot" aria-hidden="true" />
        <span className="brief-title">视觉宪法</span>
        <span className="brief-summary">{filled ? summary : '未填写 · 每镜各拍各的'}</span>
        <span className="brief-toggle">{open ? '收起' : filled ? '编辑' : '填写'}</span>
      </button>

      {open && (
        <div className="brief-body">
          {FIELDS.map((f) => (
            <div className="brief-row" key={f.key}>
              <span className="brief-label">{f.label}</span>
              <input
                value={value[f.key]}
                onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                maxLength={60}
                aria-label={f.label}
              />
            </div>
          ))}
          <div className="brief-actions">
            <span className="brief-hint">逐镜注入分镜提示词；空着时与原来完全一致</span>
            <button type="button" onClick={() => setOpen(false)}>完成</button>
          </div>
        </div>
      )}
    </div>
  )
}
