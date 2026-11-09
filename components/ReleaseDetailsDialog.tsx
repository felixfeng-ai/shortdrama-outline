'use client'

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

import {
  LATEST_PRODUCT_RELEASE,
  formatReleaseTimestamp,
} from '@/lib/releases'

interface Props {
  open: boolean
  onClose: () => void
  onDismiss: () => void
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export default function ReleaseDetailsDialog({ open, onClose, onDismiss }: Props) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus.current?.focus()
    }
  }, [onClose, open])

  if (!open) return null

  return createPortal(
    <div
      className="release-dialog-scrim"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className="release-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header className="release-dialog-head">
          <span className="release-dialog-mark" aria-hidden="true">
            <i />
          </span>
          <div className="release-dialog-title">
            <span>平台公告 · 产品更新</span>
            <h2 id={titleId}>{LATEST_PRODUCT_RELEASE.title}</h2>
            <p id={descriptionId}>{LATEST_PRODUCT_RELEASE.summary}</p>
          </div>
          <button
            ref={closeRef}
            className="release-dialog-close"
            type="button"
            aria-label="关闭公告详情"
            onClick={onClose}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </header>

        <div className="release-dialog-meta" aria-label="公告信息">
          <span>{LATEST_PRODUCT_RELEASE.status}</span>
          <span>{LATEST_PRODUCT_RELEASE.version}</span>
          <time dateTime={LATEST_PRODUCT_RELEASE.publishedAt}>
            {formatReleaseTimestamp(LATEST_PRODUCT_RELEASE.publishedAt)}
          </time>
        </div>

        <div className="release-dialog-body">
          <p>本次更新</p>
          <ol>
            {LATEST_PRODUCT_RELEASE.highlights.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{item}</p>
              </li>
            ))}
          </ol>
        </div>

        <footer className="release-dialog-footer">
          <span>公告按版本保留，已读状态只影响入口提示。</span>
          <button type="button" onClick={onDismiss}>知道了</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
