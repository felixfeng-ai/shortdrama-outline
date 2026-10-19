'use client'

// 两版对比：把"判断"变成一次明确的选择，选择理由写入判断日志。
import { useState } from 'react'

interface Option {
  id: 'A' | 'B'
  title: string
  lines: string[]
}

interface Props {
  stepLabel: string
  options: Option[]
  onPick: (id: 'A' | 'B', reason: string) => void
  onCancel: () => void
}

export default function VariantPicker({ stepLabel, options, onPick, onCancel }: Props) {
  const [reason, setReason] = useState('')

  return (
    <div className="variants" role="group" aria-label={`${stepLabel}两版对比`}>
      <div className="variants-head">
        <b>{stepLabel} · 两版对比</b>
        <span className="variants-sub">选一版继续；理由会进判断日志</span>
        <button type="button" className="variants-cancel" onClick={onCancel}>取消</button>
      </div>

      <div className="variants-grid">
        {options.map((o) => (
          <div className="variant" key={o.id}>
            <div className="variant-badge">{o.id}</div>
            <p className="variant-title">{o.title}</p>
            <ul className="variant-lines">
              {o.lines.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
            <button type="button" className="variant-pick" onClick={() => onPick(o.id, reason)}>
              选 {o.id}
            </button>
          </div>
        ))}
      </div>

      <input
        className="variants-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="为什么选它（可跳过）"
        maxLength={120}
        aria-label="选择理由"
      />
    </div>
  )
}
