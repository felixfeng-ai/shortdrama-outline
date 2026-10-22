'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  text: string
  onProgress?: () => void
  render?: (visibleText: string) => ReactNode
}

export default function StreamingText({ text, onProgress, render }: Props) {
  const [visible, setVisible] = useState(0)
  const progressRef = useRef(onProgress)
  progressRef.current = onProgress

  useEffect(() => {
    setVisible(0)
    if (!text) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(text.length)
      return
    }

    let shown = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    const chunk = Math.max(1, Math.ceil(text.length / 64))
    const tick = () => {
      shown = Math.min(text.length, shown + chunk)
      setVisible(shown)
      progressRef.current?.()
      if (shown < text.length) timer = setTimeout(tick, 18)
    }
    timer = setTimeout(tick, 36)
    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [text])

  const done = visible >= text.length

  return (
    <span className="agent-stream-wrap" aria-label={text}>
      <span className="agent-stream-text" aria-hidden="true">
        {render ? render(text.slice(0, visible)) : text.slice(0, visible)}
      </span>
      {!done && <span className="agent-stream-caret" aria-hidden="true" />}
    </span>
  )
}
