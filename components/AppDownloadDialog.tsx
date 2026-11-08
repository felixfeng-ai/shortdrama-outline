'use client'

import { useEffect, useRef, useState } from 'react'

const ANDROID_DOWNLOAD_URL = 'https://veyatv.com/app/download/android'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AppDownloadDialog({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const [version, setVersion] = useState<string | null>(null)

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

  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/mobile/release', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled) {
          const value = payload?.data?.release?.version
          setVersion(typeof value === 'string' ? value : null)
        }
      })
      .catch(() => {
        if (!cancelled) setVersion(null)
      })
    return () => { cancelled = true }
  }, [open])

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
            <span>VeyaTV MOBILE</span>
            <h2 id="wfx-app-download-title">在手机上继续同一部短剧</h2>
          </div>
          <button ref={closeRef} type="button" aria-label="关闭下载二维码" onClick={onClose}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </header>

        <div className="wfx-app-download-qr">
          <img
            src="/app-download-qr.png"
            alt="VeyaTV 手机 App 下载二维码"
            width="411"
            height="411"
          />
        </div>

        <p>使用手机官方自带浏览器或微信扫一扫，直接下载最新 Android APK。</p>
        <a
          className="wfx-app-download-direct"
          href={ANDROID_DOWNLOAD_URL}
          rel="noreferrer"
        >
          直接下载 Android APK
          {version ? <span>v{version}</span> : null}
        </a>
        <small>
          目前仅支持安卓和鸿蒙手机，iOS 版本更新中。
          登录后，Web、PWA 与 App 共用同一个项目与创作额度。
        </small>
      </section>
    </div>
  )
}
