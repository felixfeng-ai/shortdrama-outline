'use client'

import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AppDownloadDialog({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusFrame = window.requestAnimationFrame(() => closeRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, open])

  if (!open) return null

  return (
    <div
      className="wfx-app-download-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        className="wfx-app-download-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wfx-app-download-title"
      >
        <header>
          <div>
            <span>VEYAFRAME MOBILE</span>
            <h2 id="wfx-app-download-title">在手机上继续同一部短剧</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="关闭下载二维码" onClick={onClose}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </header>

        <div className="wfx-app-download-qr">
          <img
            src="/app-download-qr.png"
            alt="VeyaFrame 手机 App 下载二维码"
            width="411"
            height="405"
          />
        </div>

        <p>使用手机官方自带浏览器或微信扫一扫，下载 VeyaFrame App 体验。</p>
        <small>
          目前仅支持安卓和鸿蒙手机，iOS 版本更新中。
          登录后，Web、PWA 与 App 共用同一个项目与创作额度。
        </small>
      </section>
    </div>
  )
}
