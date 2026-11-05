'use client'

import { useEffect, useState } from 'react'

import {
  LATEST_PRODUCT_RELEASE,
  formatReleaseTimestamp,
} from '@/lib/releases'

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
    <section className="inline-release" aria-label="产品公告">
      <div className="inline-release-bar">
        <i aria-hidden="true" />
        <span>平台公告</span>
        <p>
          <b>{LATEST_PRODUCT_RELEASE.version}</b>
          {' · '}
          {LATEST_PRODUCT_RELEASE.title}
        </p>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="inline-release-detail"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? '收起' : '了解内测'}
        </button>
        <button type="button" aria-label="关闭平台公告" onClick={dismiss}>×</button>
      </div>
      {open && (
        <div className="inline-release-detail" id="inline-release-detail">
          <header>
            <b>{LATEST_PRODUCT_RELEASE.title}</b>
            <time dateTime={LATEST_PRODUCT_RELEASE.publishedAt}>
              {formatReleaseTimestamp(LATEST_PRODUCT_RELEASE.publishedAt)}
            </time>
          </header>
          <ul>
            {LATEST_PRODUCT_RELEASE.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
