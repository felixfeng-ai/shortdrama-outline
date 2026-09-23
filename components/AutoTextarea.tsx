'use client'

import { useEffect, useRef } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** 额外的 class，用于不同场景下的字号/颜色 */
  className?: string
  /** 无障碍标签 */
  ariaLabel?: string
}

/**
 * 高度自适应的输入框。
 * 结果区要「看起来像文字、改起来像输入框」，所以用 textarea 而不是 contenteditable
 * （contenteditable 要自己处理粘贴的富文本，反而更麻烦）。
 */
export default function AutoTextarea({ value, onChange, placeholder, className = '', ariaLabel }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // 每次内容变化后重算高度：先归零再按 scrollHeight 撑开
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1
        transition-colors hover:border-slate-200 hover:bg-white
        focus:border-brand-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100
        ${className}`}
    />
  )
}
