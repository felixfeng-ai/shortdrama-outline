'use client'

// 复制按钮：提示词/清单的出口，是用户最高频的交互。
// 复用 lib/export.ts 的 copyText（Clipboard API + execCommand 降级）。
import { useEffect, useRef, useState } from 'react'
import { copyText } from '@/lib/export'

interface Props {
  text: string
  label?: string
  className?: string
}

export default function CopyButton({ text, label = '复制', className = '' }: Props) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const handle = async () => {
    const ok = await copyText(text)
    setDone(ok)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDone(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handle}
      className={`shrink-0 rounded-chip border px-2.5 py-1.5 text-xs font-medium transition-colors
        focus-visible:outline-none focus-visible:ring-2
        ${
          done
            ? 'border-done-300 bg-done-50 text-done-700 focus-visible:ring-done-300'
            : 'border-surface-line bg-surface-card text-ink-600 hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700 focus-visible:ring-accent-300'
        } ${className}`}
    >
      {done ? '已复制 ✓' : label}
    </button>
  )
}
