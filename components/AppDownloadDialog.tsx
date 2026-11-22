'use client'

import { useEffect, useRef, useState } from 'react'

import VeyaBrandMark from './VeyaBrandMark'

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
          <div className="wfx-app-download-identity">
            <span className="wfx-app-download-mark" aria-hidden="true"><VeyaBrandMark /></span>
            <div>
              <span>VeyaTV MOBILE</span>
              <h2 id="wfx-app-download-title">把 VeyaTV 放进手机</h2>
              <p>一台手机，一个 Agent，继续处理同一部短剧。</p>
            </div>
          </div>
          <button ref={closeRef} type="button" aria-label="关闭下载二维码" onClick={onClose}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </header>

        <div className="wfx-app-download-body">
          <div className="wfx-app-download-scan">
            <span>扫码安装</span>
            <div className="wfx-app-download-qr">
              <img
                src="/app-download-qr.png"
                alt="VeyaTV 手机 App 下载二维码"
                width="411"
                height="411"
              />
            </div>
            <p>使用手机官方自带浏览器或微信扫一扫</p>
            <small>Android · 鸿蒙</small>
          </div>

          <div className="wfx-app-download-content">
            <div className="wfx-app-download-platform">
              <span>Android 版</span>
              <em>当前可用</em>
            </div>
            <h3>离开电脑，也能继续推进制作</h3>
            <p>
              登录同一账号，就能在手机上查看项目、跟进制作，并把新的指令交给 Veya Agent。
            </p>

            <ul>
              <li>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.5 3.2 3.2 7.8-8" /></svg>
                <span>查看项目、分镜、待办和 Agent 回复</span>
              </li>
              <li>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.5 3.2 3.2 7.8-8" /></svg>
                <span>用语音指令让 Agent 继续推进当前任务</span>
              </li>
              <li>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.5 3.2 3.2 7.8-8" /></svg>
                <span>与 Web 共用项目、版本和创作额度</span>
              </li>
            </ul>

            <a
              className="wfx-app-download-direct"
              href={ANDROID_DOWNLOAD_URL}
              rel="noreferrer"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 2.5v8m0 0 3-3m-3 3-3-3M4 12.5v2A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5v-2" />
              </svg>
              <span>直接下载 Android APK</span>
              {version ? <small>v{version}</small> : null}
            </a>

            <div className="wfx-app-download-note">
              <b>第一次安装</b>
              <p>
                目前仅支持安卓和鸿蒙手机，iOS 版本更新中。首次安装时，需要在系统中允许当前浏览器安装应用。
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
