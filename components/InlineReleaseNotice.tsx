'use client'

import { useEffect, useState } from 'react'

import {
  LATEST_PRODUCT_RELEASE,
} from '@/lib/releases'
import ReleaseDetailsDialog from './ReleaseDetailsDialog'

const STORAGE_KEY = `chengju:inline-release:${LATEST_PRODUCT_RELEASE.version}`
const RELEASE_AT = Date.parse(LATEST_PRODUCT_RELEASE.publishedAt)

interface Props {
  hidden?: boolean
}

/**
 * 工作台内的产品更新条。
 *
 * 只使用 releases.ts 的单一发布源：普通发布可关闭并记忆，
 * 进入画布等专注模式时由外部直接隐藏，不修改已读状态。
 */
export default function InlineReleaseNotice({ hidden = false }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  if (!mounted || hidden || dismissed || Number.isNaN(RELEASE_AT) || Date.now() < RELEASE_AT) {
    return null
  }

  function dismiss() {
    setDismissed(true)
    setOpen(false)
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // 隐私模式只影响下一次是否再次显示。
    }
  }

  return (
    <section className="inline-release" aria-label="平台公告">
      <div className="inline-release-bar">
        <span className="inline-release-status" aria-label="内测运行中">
          <span className="inline-release-orbit" aria-hidden="true"><i /></span>
          <span className="inline-release-status-copy">
            <b>{LATEST_PRODUCT_RELEASE.status}</b>
            <small>内测进行中</small>
          </span>
        </span>
        <span className="inline-release-copy">
          <b>{LATEST_PRODUCT_RELEASE.title}</b>
          <span>{LATEST_PRODUCT_RELEASE.summary}</span>
        </span>
        <button
          className="inline-release-action"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="inline-release-action-label">查看详情</span>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m8 5 5 5-5 5" />
          </svg>
        </button>
        <button className="inline-release-close" type="button" aria-label="关闭平台公告" onClick={dismiss}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </div>
      <ReleaseDetailsDialog
        open={open}
        onClose={() => setOpen(false)}
        onDismiss={dismiss}
      />
    </section>
  )
}
