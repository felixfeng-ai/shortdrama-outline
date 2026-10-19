'use client'

// 判断日志：自动记录换/重跑，也可以手写一句为什么。
// 默认折叠，不抢工作面的位置。
import { useState } from 'react'
import type { JudgmentEntry } from '@/lib/judgment-log'

interface Props {
  entries: JudgmentEntry[]
  onAdd: (reason: string) => void
}

function timeOf(at: number): string {
  if (!at) return '—'
  return new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

export default function JudgmentLogPanel({ entries, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  return (
    <div className="jlog">
      <button
        type="button"
        className="jlog-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="jlog-title">判断日志</span>
        <span className="jlog-count">{entries.length} 条</span>
        <span className="jlog-toggle">{open ? '收起' : '展开'}</span>
      </button>

      {open && (
        <div className="jlog-body">
          {entries.length === 0 ? (
            <p className="jlog-empty">
              换角色、重生成时会自动记一条；也可以手动写一句为什么，之后场记会引用它。
            </p>
          ) : (
            <ul className="jlog-list">
              {[...entries].reverse().map((e) => (
                <li key={e.id}>
                  <span className="jlog-time">{timeOf(e.at)}</span>
                  <span className="jlog-action">{e.action}</span>
                  {e.reason && <span className="jlog-reason">“{e.reason}”</span>}
                </li>
              ))}
            </ul>
          )}

          <form
            className="jlog-form"
            onSubmit={(e) => {
              e.preventDefault()
              const text = note.trim()
              if (!text) return
              onAdd(text)
              setNote('')
            }}
          >
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={120}
              placeholder="记一句为什么（可跳过）"
              aria-label="判断理由"
            />
            <button type="submit" disabled={!note.trim()}>记下</button>
          </form>
        </div>
      )}
    </div>
  )
}
