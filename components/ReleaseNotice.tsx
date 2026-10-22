'use client'

// 产品更新入口：不再占用首页内容区，只在顶栏留一个带新消息角标的图标。
// 发布时间可用 NEXT_PUBLIC_RELEASE_AT 覆盖（ISO 字符串，默认北京时间 10-20 17:00）。
import { useEffect, useRef, useState } from 'react'

const RELEASE_AT = Date.parse(
  process.env.NEXT_PUBLIC_RELEASE_AT || '2026-10-20T17:00:00+08:00',
)
const STORAGE_KEY = 'chengju:notice:h-deck-v1'

export default function ReleaseNotice() {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (Number.isNaN(RELEASE_AT) || Date.now() < RELEASE_AT) return
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === '1') return
    } catch {
      // 隐私模式读不到，就照常展示
    }
    setVisible(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  if (!visible) return null

  const dismiss = () => {
    setOpen(false)
    setVisible(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // 写不了也只影响下次是否再提示
    }
  }

  return (
    <div ref={rootRef} className="release-center">
      <button
        ref={triggerRef}
        type="button"
        className="release-trigger"
        aria-label="查看产品更新"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="产品更新"
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        <span className="release-badge" aria-hidden="true" />
      </button>

      {open && (
        <div className="release-popover" role="dialog" aria-label="产品更新">
          <div className="release-popover-head">
            <span className="release-dot" aria-hidden="true" />
            <b>产品更新</b>
            <button type="button" onClick={() => setOpen(false)} aria-label="收起更新说明">×</button>
          </div>
          <p>
            左边写、右边看。六步流程没变，分镜与 AI 场记并进右侧产出舱；
            分集可选 10 / 30 / 60 集。已有项目数据不受影响。
          </p>
          <button type="button" className="release-dismiss" onClick={dismiss}>
            知道了
          </button>
        </div>
      )}
    </div>
  )
}
