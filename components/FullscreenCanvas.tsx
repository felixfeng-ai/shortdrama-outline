'use client'

import { useEffect, useState } from 'react'

import { readProjectQuery, readStepQuery } from '@/lib/app-nav'
import CanvasGraphWorkspace from './CanvasGraphWorkspace'

export default function FullscreenCanvas() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectTitle, setProjectTitle] = useState('当前项目')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setProjectId(readProjectQuery(window.location.search))
    setProjectTitle(params.get('title')?.trim().slice(0, 80) || '当前项目')
    setReady(true)
  }, [])

  if (!ready) {
    return <main className="signal-desk wfx-workspace fullscreen-canvas-page" />
  }

  if (!projectId) {
    return (
      <main className="signal-desk wfx-workspace fullscreen-canvas-page">
        <div className="fullscreen-canvas-empty">
          <strong>编排画布需要项目身份</strong>
          <p>请从工作台打开一个已保存项目，再进入全屏画布。</p>
          <a href="/">返回工作台</a>
        </div>
      </main>
    )
  }

  const openStep = (step: ReturnType<typeof readStepQuery>) => {
    if (!step) return
    const params = new URLSearchParams({ project: projectId, step })
    window.location.assign(`/?${params.toString()}`)
  }

  return (
    <main className="signal-desk wfx-workspace fullscreen-canvas-page">
      <CanvasGraphWorkspace
        projectId={projectId}
        projectTitle={projectTitle}
        onOpenStep={openStep}
      />
    </main>
  )
}
