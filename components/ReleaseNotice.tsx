'use client'

// 平台公告入口：不再占用首页内容区，只在顶栏留一个带新消息角标的图标。
import { useEffect, useRef, useState } from 'react'
import ReleaseDetailsDialog from './ReleaseDetailsDialog'
import {
  LATEST_PRODUCT_RELEASE,
} from '@/lib/releases'

const RELEASE_AT = Date.parse(LATEST_PRODUCT_RELEASE.publishedAt)
const STORAGE_KEY = `chengju:product-release:${LATEST_PRODUCT_RELEASE.version}`

export default function ReleaseNotice() {
  const [visible, setVisible] = useState(false)
  const [open, setOpen] = useState(false)
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
    <div className="release-center">
      <button
        ref={triggerRef}
        type="button"
        className="release-trigger"
        aria-label="查看平台公告"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="平台公告"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
        </svg>
        <span className="release-badge" aria-hidden="true" />
      </button>

      <ReleaseDetailsDialog
        open={open}
        onClose={() => {
          setOpen(false)
          triggerRef.current?.focus()
        }}
        onDismiss={dismiss}
      />
    </div>
  )
}
