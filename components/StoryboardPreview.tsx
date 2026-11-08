"use client"

import { useEffect, useMemo, useRef, useState } from "react"

interface StoryboardSegment {
  id: string
  shotId: string
  episode: number
  shot: number
  mediaKind: "image" | "video"
  mediaUrl: string
  durationSeconds: number
  speaker: string
  dialogue: string
  action: string
  characters: string[]
}

interface PreviewPlan {
  projectId: string
  status: "ready" | "insufficient"
  minDurationSeconds: number
  maxDurationSeconds: number
  totalDurationSeconds: number
  segmentCount: number
  imageSegments: number
  videoSegments: number
  skippedShots: number
  message: string
  segments: StoryboardSegment[]
}

interface RepairAction {
  label: string
  workspace: "characters" | "acts" | "episodes" | "visuals" | "scenes" | "shots" | "tasks" | "delivery"
}

interface PreviewResponse {
  preview: PreviewPlan
  acceptance: {
    verdict: "ready" | "incomplete" | "blocked"
    nextAction: RepairAction | null
    counts: {
      episodes: number
      imageEpisodes: number
      videoEpisodes: number
      deliveredEpisodes: number
    }
  }
}

interface StoryboardExportDto {
  id: string
  status: "running" | "ready" | "failed"
  includeNarration: boolean
  includeBgm: boolean
  bgmTrackId: string | null
  durationMs: number
  narrationCount: number
  subtitleMode: "burned" | "sidecar"
  warning: string | null
  error: string | null
  createdAt: number
}

interface ExportLibrary {
  exports: StoryboardExportDto[]
  options: {
    quote: {
      voiceover: {
        available: boolean
        characterCount: number
        estimatedCostMicros: number | null
        reason: string | null
      }
    }
    bgm: { id: string; name: string; mood: string | null } | null
  }
}

interface Props {
  projectId: string
}

function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value))
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

function PlayIcon({ pause = false }: { pause?: boolean }) {
  return pause
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" /></svg>
}

function RestartIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a8 8 0 1 1 2.3 6M4 5v6h6" /></svg>
}

function ArrowIcon({ reverse = false }: { reverse?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={reverse ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"} />
    </svg>
  )
}

function workspaceHref(projectId: string, workspace: RepairAction["workspace"]): string {
  if (workspace === "delivery") return `/delivery/${projectId}`
  const step = workspace === "tasks" ? "shots" : workspace
  return `/?project=${projectId}&step=${step}`
}

export default function StoryboardPreview({ projectId }: Props) {
  const [data, setData] = useState<PreviewResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [exportLibrary, setExportLibrary] = useState<ExportLibrary | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportBusy, setExportBusy] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/storyboard-preview`, {
        cache: "no-store",
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "动态分镜读取失败")
      }
      setData(payload.data as PreviewResponse)
      void loadExports()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "动态分镜读取失败")
    } finally {
      setLoading(false)
    }
  }

  async function loadExports() {
    try {
      const response = await fetch(`/api/projects/${projectId}/storyboard-exports`, {
        cache: "no-store",
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) return
      setExportLibrary(payload.data as ExportLibrary)
    } catch {
      // 媒体导出可用性失败不能阻断分镜播放。
    }
  }

  async function exportStoryboard() {
    if (exportBusy) return
    setExportBusy(true)
    setExportError(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/storyboard-exports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          includeNarration: exportLibrary?.options.quote.voiceover.available ?? false,
          includeBgm: true,
        }),
      })
      const payload = await response.json()
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "分享视频导出失败")
      }
      setExportOpen(false)
      await loadExports()
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "分享视频导出失败")
    } finally {
      setExportBusy(false)
    }
  }

  useEffect(() => {
    void load()
  }, [projectId])

  const preview = data?.preview ?? null
  const segments = preview?.segments ?? []
  const current = segments[currentIndex] ?? null
  const currentDurationMs = (current?.durationSeconds ?? 0) * 1_000
  const segmentStarts = useMemo(() => {
    let elapsed = 0
    return segments.map((segment) => {
      const start = elapsed
      elapsed += segment.durationSeconds
      return start
    })
  }, [segments])
  const currentStart = segmentStarts[currentIndex] ?? 0
  const overallElapsed = Math.min(
    preview?.totalDurationSeconds ?? 0,
    currentStart + elapsedMs / 1_000,
  )
  const overallProgress = preview && preview.totalDurationSeconds > 0
    ? Math.min(100, overallElapsed / preview.totalDurationSeconds * 100)
    : 0
  const voiceover = exportLibrary?.options.quote.voiceover ?? null
  const latestExport = exportLibrary?.exports.find((item) => item.status === "ready") ?? null

  useEffect(() => {
    if (!playing || !current || currentDurationMs <= 0) return
    const startedAt = performance.now() - elapsedMs
    let frame = 0
    const tick = (now: number) => {
      const nextElapsed = now - startedAt
      if (nextElapsed >= currentDurationMs) {
        if (currentIndex < segments.length - 1) {
          setElapsedMs(0)
          setCurrentIndex((index) => index + 1)
        } else {
          setElapsedMs(currentDurationMs)
          setPlaying(false)
        }
        return
      }
      setElapsedMs(nextElapsed)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, currentIndex, currentDurationMs, segments.length])

  useEffect(() => {
    setElapsedMs(0)
  }, [currentIndex])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (playing) {
      void video.play().catch(() => setPlaying(false))
    } else {
      video.pause()
    }
  }, [playing, currentIndex])

  const jumpTo = (index: number) => {
    setCurrentIndex(index)
    setElapsedMs(0)
    setPlaying(true)
  }

  const togglePlayback = () => {
    if (!current) return
    if (!playing && currentIndex === segments.length - 1 && elapsedMs >= currentDurationMs) {
      setCurrentIndex(0)
      setElapsedMs(0)
      setPlaying(true)
      return
    }
    setPlaying((value) => !value)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!preview || preview.status !== "ready") return
      if (exportOpen) return
      if (event.code === "Space") {
        event.preventDefault()
        togglePlayback()
      }
      if (event.key === "ArrowRight") {
        event.preventDefault()
        jumpTo(Math.min(segments.length - 1, currentIndex + 1))
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        jumpTo(Math.max(0, currentIndex - 1))
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [preview, playing, currentIndex, elapsedMs, segments.length, currentDurationMs, exportOpen])

  if (loading) {
    return (
      <main className="storyboard-shell">
        <div className="storyboard-state" aria-live="polite">
          <span className="storyboard-spinner" />
          <h1>正在读取真实镜头素材</h1>
          <p>只读取当前项目已采用的视频和首帧。</p>
        </div>
      </main>
    )
  }

  if (error || !data || !preview) {
    return (
      <main className="storyboard-shell">
        <div className="storyboard-state is-error" role="alert">
          <h1>动态分镜暂时无法打开</h1>
          <p>{error || "项目数据不存在"}</p>
          <button type="button" onClick={() => void load()}>重新读取</button>
          <a href={`/?project=${projectId}&step=shots`}>返回项目</a>
        </div>
      </main>
    )
  }

  if (preview.status !== "ready") {
    const nextAction = data.acceptance.nextAction
    return (
      <main className="storyboard-shell">
        <header className="storyboard-topbar">
          <a href={`/?project=${projectId}&step=shots`} className="storyboard-back">返回项目</a>
          <div><b>VeyaTV</b><span>动态分镜</span></div>
        </header>
        <section className="storyboard-insufficient" aria-live="polite">
          <div className="storyboard-insufficient-copy">
            <span>真实素材不足</span>
            <h1>还差 {Math.max(0, preview.minDurationSeconds - preview.totalDurationSeconds)} 秒</h1>
            <p>{preview.message}</p>
          </div>
          <div className="storyboard-coverage">
            <div>
              <span>已采用</span>
              <b>{preview.segmentCount} 镜</b>
            </div>
            <div>
              <span>视频</span>
              <b>{preview.videoSegments}</b>
            </div>
            <div>
              <span>首帧</span>
              <b>{preview.imageSegments}</b>
            </div>
            <div>
              <span>目标</span>
              <b>{preview.minDurationSeconds} 秒</b>
            </div>
          </div>
          <div className="storyboard-coverage-bar" aria-label={`动态分镜覆盖 ${preview.totalDurationSeconds} 秒`}>
            <i style={{ width: `${Math.min(100, preview.totalDurationSeconds / preview.minDurationSeconds * 100)}%` }} />
          </div>
          <div className="storyboard-next-action">
            <div>
              <span>下一步</span>
              <b>{nextAction?.label ?? "继续补齐已采用镜头素材"}</b>
            </div>
            <a href={workspaceHref(projectId, nextAction?.workspace ?? "shots")}>继续制作</a>
          </div>
          {preview.segments.length > 0 && (
            <div className="storyboard-insufficient-strip">
              {preview.segments.map((segment) => (
                <div key={segment.id}>
                  {segment.mediaKind === "video"
                    ? <video src={segment.mediaUrl} muted playsInline preload="metadata" />
                    : <img src={segment.mediaUrl} alt={`第 ${segment.episode} 集第 ${segment.shot} 镜`} />}
                  <span>{segment.episode}-{String(segment.shot).padStart(2, "0")}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    )
  }

  if (!current) return null

  return (
    <main className="storyboard-shell">
      <header className="storyboard-topbar">
        <a href={`/?project=${projectId}&step=shots`} className="storyboard-back">返回项目</a>
        <div><b>VeyaTV</b><span>动态分镜</span></div>
        <span className="storyboard-real-badge"><i /> 真实已采用素材</span>
      </header>

      <section className="storyboard-layout">
        <div className="storyboard-center">
          <div className={`storyboard-stage ${playing ? "is-playing" : ""}`}>
            <div className="storyboard-frame" key={current.id}>
              {current.mediaKind === "video" ? (
                <video
                  ref={videoRef}
                  src={current.mediaUrl}
                  muted
                  playsInline
                  preload="auto"
                />
              ) : (
                <img
                  className="storyboard-kenburns"
                  src={current.mediaUrl}
                  alt={`第 ${current.episode} 集第 ${current.shot} 镜`}
                />
              )}
              <div className="storyboard-frame-shade" />
              <div className="storyboard-frame-meta">
                <span>第 {current.episode} 集</span>
                <b>镜 {String(current.shot).padStart(2, "0")}</b>
              </div>
              {(current.dialogue || current.action) && (
                <div className="storyboard-caption">
                  {current.speaker && <span>{current.speaker}</span>}
                  <p>{current.dialogue || current.action}</p>
                </div>
              )}
              {!playing && (
                <button className="storyboard-stage-play" type="button" aria-label="播放动态分镜" onClick={togglePlayback}>
                  <PlayIcon />
                </button>
              )}
            </div>
          </div>

          <div className="storyboard-controls">
            <div className="storyboard-control-buttons">
              <button type="button" aria-label="上一镜" onClick={() => jumpTo(Math.max(0, currentIndex - 1))}>
                <ArrowIcon reverse />
              </button>
              <button className="is-primary" type="button" aria-label={playing ? "暂停" : "播放"} onClick={togglePlayback}>
                <PlayIcon pause={playing} />
              </button>
              <button type="button" aria-label="下一镜" onClick={() => jumpTo(Math.min(segments.length - 1, currentIndex + 1))}>
                <ArrowIcon />
              </button>
              <button type="button" aria-label="从头播放" onClick={() => jumpTo(0)}>
                <RestartIcon />
              </button>
            </div>
            <div className="storyboard-progress">
              <div>
                <i style={{ width: `${overallProgress}%` }} />
              </div>
              <span>{formatTime(overallElapsed)} / {formatTime(preview.totalDurationSeconds)}</span>
            </div>
          </div>
          <div className="storyboard-export-bar">
            <div>
              <b>
                自动配音
                {voiceover?.available
                  ? ` · ${voiceover.characterCount} 字`
                  : "未启用"}
              </b>
              <span>
                系统 BGM
                {exportLibrary?.options.bgm ? ` · ${exportLibrary.options.bgm.name}` : ""}
                {voiceover?.available && voiceover.estimatedCostMicros !== null
                  ? ` · 配音约 ¥${(voiceover.estimatedCostMicros / 1_000_000).toFixed(2)}`
                  : ""}
              </span>
            </div>
            <div className="storyboard-export-actions">
              {latestExport && (
                <>
                  <a href={`/api/projects/${projectId}/storyboard-exports/${latestExport.id}/file?kind=video`}>
                    下载 MP4
                  </a>
                  <a href={`/api/projects/${projectId}/storyboard-exports/${latestExport.id}/file?kind=srt`}>
                    下载 SRT
                  </a>
                </>
              )}
              <button
                type="button"
                disabled={exportBusy}
                onClick={() => {
                  setExportError(null)
                  setExportOpen(true)
                }}
              >
                {exportBusy ? "正在导出…" : "导出分享视频"}
              </button>
            </div>
          </div>
        </div>

        <aside className="storyboard-rail" aria-label="动态分镜镜头序列">
          <header>
            <div>
              <span>镜头序列</span>
              <b>{preview.segmentCount} 镜 · {preview.totalDurationSeconds} 秒</b>
            </div>
            <small>{preview.videoSegments} 视频 · {preview.imageSegments} 首帧</small>
          </header>
          <ol>
            {segments.map((segment, index) => (
              <li key={segment.id}>
                <button
                  type="button"
                  className={index === currentIndex ? "is-current" : ""}
                  aria-current={index === currentIndex ? "true" : undefined}
                  onClick={() => jumpTo(index)}
                >
                  <span className="storyboard-rail-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="storyboard-rail-copy">
                    <b>第 {segment.episode} 集 · 镜 {String(segment.shot).padStart(2, "0")}</b>
                    <small>{segment.mediaKind === "video" ? "镜头视频" : "首帧动效"} · {segment.durationSeconds} 秒</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </section>
      {exportOpen && (
        <div className="storyboard-export-scrim">
          <section
            className="storyboard-export-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="storyboard-export-title"
          >
            <header>
              <span>独立 MP4</span>
              <h2 id="storyboard-export-title">导出分享视频</h2>
              <p>
                按当前真实的 {preview.segmentCount} 镜生成竖屏视频、字幕和系统 BGM。
              </p>
            </header>
            <dl>
              <div><dt>时长</dt><dd>{preview.totalDurationSeconds} 秒</dd></div>
              <div>
                <dt>自动配音</dt>
                <dd>{voiceover?.available ? `${voiceover.characterCount} 字` : "未启用"}</dd>
              </div>
              <div>
                <dt>配音费用</dt>
                <dd>
                  {voiceover?.estimatedCostMicros !== null && voiceover?.estimatedCostMicros !== undefined
                    ? `约 ¥${(voiceover.estimatedCostMicros / 1_000_000).toFixed(2)}`
                    : "无额外配音费用"}
                </dd>
              </div>
            </dl>
            {!voiceover?.available && (
              <p className="storyboard-export-warning">{voiceover?.reason}</p>
            )}
            {exportError && <p className="storyboard-export-error" role="alert">{exportError}</p>}
            <footer>
              <button type="button" disabled={exportBusy} onClick={() => setExportOpen(false)}>
                取消
              </button>
              <button type="button" disabled={exportBusy} onClick={() => void exportStoryboard()}>
                {exportBusy ? "正在渲染 MP4…" : "确认并导出"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}
