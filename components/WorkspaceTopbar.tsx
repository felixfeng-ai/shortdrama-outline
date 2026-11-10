'use client'

import type { WorkspaceMode } from '@/lib/app-nav'
import { useState } from 'react'
import AppDownloadDialog from './AppDownloadDialog'
import AuthButton from './AuthButton'
import PwaInstallButton from './PwaInstallButton'
import PushNotificationButton from './PushNotificationButton'
import VeyaBrandMark from './VeyaBrandMark'
import VeyaWordmark from './VeyaWordmark'

interface Props {
  mode: WorkspaceMode
  projectTitle: string
  hasProject: boolean
  savedLabel: string
  running: boolean
  onOpenMobileMenu: () => void
  onExport: () => void
  onOpenMore: () => void
}

const PAGE_NAMES: Record<WorkspaceMode, string> = {
  overview: "总览",
  create: "创作",
  canvas: "画布",
}

export default function WorkspaceTopbar({
  mode,
  projectTitle,
  hasProject,
  savedLabel,
  running,
  onOpenMobileMenu,
  onExport,
  onOpenMore,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [appDownloadOpen, setAppDownloadOpen] = useState(false)

  return (
    <>
      <header className="wfx-topbar">
      <button
        className="wfx-mobile-menu"
        type="button"
        aria-label="打开工作区菜单"
        onClick={onOpenMobileMenu}
      >
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" /></svg>
      </button>

      <a className="wfx-mobile-brand" href="#" aria-label="VeyaTV 首页">
          <VeyaBrandMark />
        <VeyaWordmark />
      </a>

      <div className="wfx-crumb">
        <span>{hasProject ? "我的项目" : "创作入口"}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 5 5 5-5 5" /></svg>
        <b>
          {!hasProject
            ? mode === "create" ? "创作" : "开始创作"
            : mode === "overview" ? projectTitle : `${projectTitle} · ${PAGE_NAMES[mode]}`}
        </b>
      </div>

        <div className="wfx-topbar-actions">
        {hasProject && savedLabel && (
          <span className={`wfx-save-state ${running ? 'is-running' : ''}`}>
            <i />
            {running ? "正在生成…" : savedLabel}
          </span>
        )}
        {hasProject && (
          <button className="wfx-button is-secondary" type="button" onClick={onExport}>
            导出交付包
          </button>
        )}
          <button
            className="wfx-icon-button wfx-app-download-entry"
            type="button"
            aria-label="下载手机 App"
            title="下载手机 App"
            aria-haspopup="dialog"
            aria-expanded={appDownloadOpen}
            onClick={() => setAppDownloadOpen(true)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="3.5" y="3.5" width="5" height="5" rx=".5" />
              <rect x="11.5" y="3.5" width="5" height="5" rx=".5" />
              <rect x="3.5" y="11.5" width="5" height="5" rx=".5" />
              <path d="M12 12h2M16 12v2M12 16h4" />
            </svg>
          </button>
          <button
          className="wfx-icon-button"
          type="button"
          aria-label="更多项目工具"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <circle cx="4" cy="10" r="1" />
            <circle cx="10" cy="10" r="1" />
            <circle cx="16" cy="10" r="1" />
          </svg>
        </button>
        <AuthButton variant="workspace-avatar" />
        {moreOpen && (
          <div className="wfx-more-menu" role="menu" aria-label="更多工具">
            {hasProject && (
              <button type="button" role="menuitem" onClick={() => { setMoreOpen(false); onOpenMore() }}>
                项目工具
              </button>
            )}
            <a href="/docs" role="menuitem">使用教程</a>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false)
                setAppDownloadOpen(true)
              }}
            >
              下载手机 App
            </button>
            <PwaInstallButton />
            <PushNotificationButton />
          </div>
        )}
        </div>
      </header>
      <AppDownloadDialog open={appDownloadOpen} onClose={() => setAppDownloadOpen(false)} />
    </>
  )
}
