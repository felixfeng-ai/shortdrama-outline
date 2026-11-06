'use client'

import { useEffect, useMemo, useRef, useState } from "react"

import {
  applyNovelDeslop,
  auditNovelChapter,
  createNovelEdition,
  fetchNovelEditions,
  fetchNovelWorkspace,
  novelExportUrl,
  pauseNovelGeneration,
  planNovelGeneration,
  previewNovelDeslop,
  regenerateNovelChapter,
  resumeNovelGeneration,
  startNovelGeneration,
  updateNovelChapter,
  type NovelWorkspacePayload,
} from "@/lib/novels/client"
import {
  NOVEL_PRESETS,
  estimateNovelGeneration,
  novelPresetLabel,
  readNovelPreset,
} from "@/lib/novels/presets"
import type { NovelLintReport } from "@/lib/novels/lint"
import type {
  NovelChapterRecord,
  NovelExportFormat,
  NovelPresetId,
} from "@/lib/novels/types"
import "@/app/novels/novel.css"

interface Props {
  projectId: string
}

type MobilePane = "outline" | "editor" | "inspect"

const STATUS_LABEL: Record<string, string> = {
  draft: "待规划",
  planned: "待生成",
  generating: "生成中",
  paused: "已暂停",
  complete: "已完成",
  failed: "失败",
  planned_chapter: "待生成",
  generating_chapter: "生成中",
  generated: "已生成",
  edited: "已编辑",
  stale: "上游已变化",
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("zh-CN")
}

function Icon({ name }: { name: "back" | "book" | "export" | "spark" | "check" | "pause" | "play" }) {
  const paths = {
    back: <><path d="m15 5-7 7 7 7" /><path d="M8 12h11" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v17H6.5A2.5 2.5 0 0 0 4 22.5v-17Z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v17h4.5A2.5 2.5 0 0 1 20 22.5v-17Z" /></>,
    export: <><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 14v5h14v-5" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 16 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    play: <path d="m8 5 11 7-11 7z" />,
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

function wordCount(text: string): number {
  return Array.from(text.replace(/\s+/g, "")).length
}

export default function NovelWorkspace({ projectId }: Props) {
  const [editions, setEditions] = useState<Awaited<ReturnType<typeof fetchNovelEditions>>>([])
  const [workspace, setWorkspace] = useState<NovelWorkspacePayload | null>(null)
  const [activeNovelId, setActiveNovelId] = useState("")
  const [selectedChapterId, setSelectedChapterId] = useState("")
  const [preset, setPreset] = useState<NovelPresetId | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [mobilePane, setMobilePane] = useState<MobilePane>("editor")
  const [draftTitle, setDraftTitle] = useState("")
  const [draftOutline, setDraftOutline] = useState("")
  const [draftContent, setDraftContent] = useState("")
  const [audit, setAudit] = useState<NovelLintReport | null>(null)
  const [deslop, setDeslop] = useState<{
    content: string
    notes: string[]
    promptVersion: string
  } | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const resumeRef = useRef(false)

  const activePreset = readNovelPreset(workspace?.edition.preset ?? preset)
  const selectedChapter = workspace?.chapters.find((chapter) => chapter.id === selectedChapterId) ?? null
  const completed = workspace?.chapters.filter((chapter) =>
    chapter.status === "generated" || chapter.status === "edited").length ?? 0
  const total = workspace?.chapters.length ?? 0
  const estimate = activePreset
    ? estimateNovelGeneration(activePreset, workspace?.upstream.episodeCount ?? 0)
    : null
  const dirty = Boolean(selectedChapter && (
    selectedChapter.title !== draftTitle
    || selectedChapter.outline !== draftOutline
    || selectedChapter.content !== draftContent
  ))

  const volumeChapters = useMemo(() => {
    if (!workspace) return []
    return workspace.volumes.map((volume) => ({
      volume,
      chapters: workspace.chapters.filter((chapter) =>
        chapter.number >= volume.startChapter && chapter.number <= volume.endChapter),
    }))
  }, [workspace])

  function selectChapter(chapter: NovelChapterRecord) {
    setSelectedChapterId(chapter.id)
    setDraftTitle(chapter.title)
    setDraftOutline(chapter.outline)
    setDraftContent(chapter.content)
    setAudit(null)
    setDeslop(null)
    setMobilePane("editor")
  }

  function applyWorkspace(next: NovelWorkspacePayload, keepDraft = false) {
    setWorkspace(next)
    setActiveNovelId(next.edition.id)
    setPreset(next.edition.preset)
    const chapterStillExists = next.chapters.some((chapter) => chapter.id === selectedChapterId)
    const firstChapter = next.chapters[0] ?? null
    const target = chapterStillExists
      ? next.chapters.find((chapter) => chapter.id === selectedChapterId) ?? firstChapter
      : firstChapter
    if (target && (!keepDraft || target.id !== selectedChapterId)) {
      setSelectedChapterId(target.id)
      if (!keepDraft) {
        setDraftTitle(target.title)
        setDraftOutline(target.outline)
        setDraftContent(target.content)
      }
    }
  }

  async function loadWorkspace(novelId: string, keepDraft = false) {
    const next = await fetchNovelWorkspace(projectId, novelId)
    applyWorkspace(next, keepDraft)
    return next
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchNovelEditions(projectId)
      .then(async (items) => {
        if (!active) return
        setEditions(items)
        const queryNovel = new URLSearchParams(window.location.search).get("novel")
        const initial = items.find((item) => item.id === queryNovel) ?? items[0]
        if (initial) {
          await loadWorkspace(initial.id)
        } else {
          setPreset(null)
        }
      })
      .catch((error) => {
        if (active) setNotice(error instanceof Error ? error.message : "小说工作区读取失败")
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // loadWorkspace 只依赖稳定的 projectId，不把函数引用放进 effect，避免每次渲染重启加载。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (!workspace?.run || !["queued", "running", "waiting"].includes(workspace.run.status)) return
    let cancelled = false
    const timer = window.setInterval(async () => {
      try {
        const next = await fetchNovelWorkspace(projectId, workspace.edition.id)
        if (cancelled) return
        applyWorkspace(next, dirty)
        setEditions(await fetchNovelEditions(projectId))
        if (
          !resumeRef.current
          && next.run
          && (next.run.status === "queued" || next.run.status === "waiting")
          && Date.now() - next.run.updatedAt > 1_500
        ) {
          resumeRef.current = true
          await resumeNovelGeneration(projectId, workspace.edition.id)
          window.setTimeout(() => { resumeRef.current = false }, 3_000)
        }
      } catch {
        // 单次轮询失败不影响下一轮；真正中断由页面通知和任务状态呈现。
      }
    }, 2_500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
    // dirty 只用于避免覆盖用户输入，轮询身份仍由当前小说决定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workspace?.edition.id, workspace?.run?.status, dirty])

  useEffect(() => {
    if (!workspace?.edition.id || !selectedChapter?.id || !selectedChapter.content.trim()) {
      setAudit(null)
      return
    }
    let active = true
    auditNovelChapter(projectId, workspace.edition.id, selectedChapter.id)
      .then((result) => {
        if (active) setAudit(result.report)
      })
      .catch(() => {
        if (active) setAudit(null)
      })
    return () => { active = false }
  }, [projectId, workspace?.edition.id, selectedChapter?.id, selectedChapter?.revision])

  async function createEdition() {
    if (!preset) {
      setNotice("请先选择篇幅")
      return
    }
    setBusy(true)
    try {
      const created = await createNovelEdition(projectId, { preset })
      const planned = await planNovelGeneration(projectId, created.edition.id, preset)
      const next = await loadWorkspace(created.edition.id)
      setEditions((current) => [next.edition, ...current.filter((item) => item.id !== next.edition.id)])
      setNotice(`已生成 ${planned.chapters.length} 章目录，确认预算后开始写作`)
      setBudgetOpen(true)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "小说稿创建失败")
    } finally {
      setBusy(false)
      setLoading(false)
    }
  }

  async function switchEdition(novelId: string) {
    if (!novelId || novelId === activeNovelId) return
    setBusy(true)
    try {
      await loadWorkspace(novelId)
      setNotice(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "小说稿切换失败")
    } finally {
      setBusy(false)
    }
  }

  async function startGeneration() {
    if (!workspace || !activePreset) return
    setBudgetOpen(false)
    setBusy(true)
    try {
      const result = await startNovelGeneration(projectId, workspace.edition.id, activePreset.id)
      setWorkspace((current) => current ? { ...current, run: result.run, edition: {
        ...current.edition,
        status: "generating",
      } } : current)
      setNotice("小说任务已入队；媒体任务运行时它会自动等待")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "小说生成启动失败")
    } finally {
      setBusy(false)
    }
  }

  async function pauseGeneration() {
    if (!workspace) return
    setBusy(true)
    try {
      const result = await pauseNovelGeneration(projectId, workspace.edition.id)
      setWorkspace((current) => current ? { ...current, run: result.run } : current)
      setNotice("小说生成已暂停，已完成章节会保留")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "暂停失败")
    } finally {
      setBusy(false)
    }
  }

  async function resumeGeneration() {
    if (!workspace) return
    setBusy(true)
    try {
      const result = await resumeNovelGeneration(projectId, workspace.edition.id)
      setWorkspace((current) => current ? { ...current, run: result.run } : current)
      setNotice("小说生成已继续")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "继续失败")
    } finally {
      setBusy(false)
    }
  }

  async function saveChapter() {
    if (!workspace || !selectedChapter) return
    setBusy(true)
    try {
      const updated = await updateNovelChapter(projectId, workspace.edition.id, selectedChapter.id, {
        title: draftTitle.trim(),
        outline: draftOutline.trim(),
        content: draftContent,
      })
      setWorkspace((current) => current ? {
        ...current,
        chapters: current.chapters.map((chapter) => chapter.id === updated.id ? updated : chapter),
      } : current)
      setSelectedChapterId(updated.id)
      setNotice(`第 ${updated.number} 章已保存 · r${updated.revision}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "章节保存失败")
    } finally {
      setBusy(false)
    }
  }

  async function regenerateChapter() {
    if (!workspace || !selectedChapter) return
    setBusy(true)
    try {
      const updated = await regenerateNovelChapter(projectId, workspace.edition.id, selectedChapter.id)
      setWorkspace((current) => current ? {
        ...current,
        chapters: current.chapters.map((chapter) => chapter.id === updated.id ? updated : chapter),
      } : current)
      setDraftTitle(updated.title)
      setDraftOutline(updated.outline)
      setDraftContent(updated.content)
      setDeslop(null)
      setNotice(`第 ${updated.number} 章已重新生成`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "章节重生成失败")
    } finally {
      setBusy(false)
    }
  }

  async function previewDeslop() {
    if (!workspace || !selectedChapter || !selectedChapter.content.trim()) return
    setBusy(true)
    try {
      const result = await previewNovelDeslop(projectId, workspace.edition.id, selectedChapter.id)
      setDeslop({ ...result.proposed, promptVersion: result.promptVersion })
      setAudit(result.report)
      setMobilePane("inspect")
      setNotice("修订稿已生成，确认后才会写入新版本")
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "去 AI 味预览失败")
    } finally {
      setBusy(false)
    }
  }

  async function applyDeslop() {
    if (!workspace || !selectedChapter || !deslop) return
    setBusy(true)
    try {
      const result = await applyNovelDeslop(
        projectId,
        workspace.edition.id,
        selectedChapter.id,
        deslop.content,
      )
      setWorkspace((current) => current ? {
        ...current,
        chapters: current.chapters.map((chapter) =>
          chapter.id === result.chapter.id ? result.chapter : chapter),
      } : current)
      setDraftContent(result.chapter.content)
      setAudit(result.report)
      setDeslop(null)
      setNotice(`修订已保存为第 ${result.chapter.revision} 版`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "修订应用失败")
    } finally {
      setBusy(false)
    }
  }

  function exportNovel(format: NovelExportFormat) {
    if (!workspace) return
    window.location.href = novelExportUrl(projectId, workspace.edition.id, format)
    setExportOpen(false)
  }

  if (loading) {
    return (
      <main className="novel-page novel-loading">
        <span className="novel-loading-mark"><Icon name="book" /></span>
        <p>正在读取小说工作区</p>
      </main>
    )
  }

  if (editions.length === 0) {
    return (
      <main className="novel-page novel-setup">
        <header className="novel-setup-top">
          <a href={`/?project=${encodeURIComponent(projectId)}`}><Icon name="back" />返回项目</a>
          <span>VeyaFrame · 小说稿</span>
        </header>
        <section className="novel-setup-main">
          <div className="novel-setup-copy">
            <span className="novel-kicker">NOVEL WORKSPACE</span>
            <h1>把已经写好的分集，扩成一部能连载的小说。</h1>
            <p>人物、关系、场次和 Canon 直接复用。小说是项目附赠稿，不占第七步，也不会拖慢图片、视频和成片渲染。</p>
          </div>
          <div className="novel-preset-list" role="radiogroup" aria-label="小说篇幅">
            {NOVEL_PRESETS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={preset === item.id}
                className={preset === item.id ? "is-selected" : ""}
                onClick={() => setPreset(item.id)}
              >
                <span>
                  <b>{item.label}</b>
                  <small>{item.description}</small>
                </span>
                <em>{item.chaptersMin}-{item.chaptersMax} 章</em>
                <strong>{Math.round(item.wordsMin / 10_000)}-{Math.round(item.wordsMax / 10_000)} 万字</strong>
              </button>
            ))}
          </div>
          <div className="novel-setup-action">
            <span>{preset ? `已选 ${novelPresetLabel(preset)} · 下一步查看目录与预算` : "先选择篇幅，不会自动开始生成"}</span>
            <button type="button" disabled={!preset || busy} onClick={createEdition}>
              <Icon name="spark" />
              {busy ? "正在建立目录…" : "建立小说稿"}
            </button>
          </div>
        </section>
        {notice && <div className="novel-toast" role="status">{notice}</div>}
      </main>
    )
  }

  return (
    <main className="novel-page novel-workspace">
      <header className="novel-topbar">
        <a className="novel-back" href={`/?project=${encodeURIComponent(projectId)}`} aria-label="返回短剧项目">
          <Icon name="back" />
        </a>
        <div className="novel-brand">
          <span><Icon name="book" /></span>
          <b>小说稿</b>
          <small>VeyaFrame</small>
        </div>
        <div className="novel-crumb">
          <span>{workspace?.edition.title || "当前项目"}</span>
          <i>/</i>
          <b>{workspace ? novelPresetLabel(workspace.edition.preset) : "未选择篇幅"}</b>
        </div>
        <div className="novel-top-actions">
          <span className={`novel-run-state ${workspace?.run && ["queued", "running", "waiting"].includes(workspace.run.status) ? "is-running" : ""}`}>
            <i />
            {workspace?.run
              ? workspace.run.status === "waiting"
                ? `等待媒体任务 · ${completed}/${total}`
                : workspace.run.status === "running"
                  ? `正在写第 ${Math.min(total, workspace.run.cursor + 1)} 章`
                  : workspace.run.status === "paused"
                    ? `已暂停 · ${completed}/${total}`
                    : workspace.run.status === "complete"
                      ? `全部完成 · ${completed}/${total}`
                      : `排队中 · ${completed}/${total}`
              : `${completed}/${total} 章`}
          </span>
          {workspace?.run && ["queued", "running", "waiting"].includes(workspace.run.status) ? (
            <button className="novel-action secondary" type="button" onClick={pauseGeneration} disabled={busy}>
              <Icon name="pause" />暂停
            </button>
          ) : workspace?.run && workspace.run.status !== "complete" ? (
            <button className="novel-action secondary" type="button" onClick={resumeGeneration} disabled={busy}>
              <Icon name="play" />继续
            </button>
          ) : (
            <button className="novel-action primary" type="button" onClick={() => setBudgetOpen(true)} disabled={busy || total === 0}>
              <Icon name="spark" />开始生成
            </button>
          )}
          <div className="novel-export-wrap">
            <button className="novel-action secondary" type="button" onClick={() => setExportOpen((open) => !open)} aria-expanded={exportOpen}>
              <Icon name="export" />导出
            </button>
            {exportOpen && (
              <div className="novel-export-menu">
                <button type="button" onClick={() => exportNovel("md")}>Markdown</button>
                <button type="button" onClick={() => exportNovel("txt")}>TXT</button>
                <button type="button" onClick={() => exportNovel("docx")}>DOCX</button>
                <button type="button" onClick={() => exportNovel("epub")}>EPUB</button>
                <button type="button" onClick={() => exportNovel("zip")}>ZIP 完整包</button>
              </div>
            )}
          </div>
          <button className="novel-more" type="button" aria-label="小说稿选项" onClick={() => setMoreOpen((open) => !open)}>
            <span /><span /><span />
          </button>
          {moreOpen && (
            <div className="novel-more-menu">
              <span className="novel-more-label">切换小说稿</span>
              {editions.map((edition) => (
                <button
                  key={edition.id}
                  type="button"
                  className={edition.id === activeNovelId ? "is-active" : ""}
                  onClick={() => { setMoreOpen(false); void switchEdition(edition.id) }}
                >
                  {edition.title} · {novelPresetLabel(edition.preset)}
                </button>
              ))}
              <span className="novel-more-label novel-mobile-export">导出小说</span>
              {([
                ["md", "Markdown"],
                ["txt", "TXT"],
                ["docx", "DOCX"],
                ["epub", "EPUB"],
                ["zip", "ZIP 完整包"],
              ] as const).map(([format, label]) => (
                <button
                  key={format}
                  className="novel-mobile-export"
                  type="button"
                  onClick={() => {
                    setMoreOpen(false)
                    exportNovel(format)
                  }}
                >
                  {label}
                </button>
              ))}
              <a href={`/docs#novel`} onClick={() => setMoreOpen(false)}>使用说明</a>
            </div>
          )}
        </div>
      </header>

      <div className="novel-mobile-tabs" role="tablist" aria-label="小说工作区视图">
        {([
          ["outline", "目录"],
          ["editor", "正文"],
          ["inspect", "检查"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mobilePane === id}
            className={mobilePane === id ? "is-active" : ""}
            onClick={() => setMobilePane(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="novel-layout">
        <aside className={`novel-outline ${mobilePane === "outline" ? "is-mobile-active" : ""}`} aria-label="卷章目录">
          <header>
            <span>结构</span>
            <b>{volumeChapters.length} 卷 · {total} 章</b>
          </header>
          <div className="novel-progress-card">
            <div>
              <span>完成度</span>
              <b>{total ? Math.round((completed / total) * 100) : 0}%</b>
            </div>
            <i><span style={{ width: `${total ? (completed / total) * 100 : 0}%` }} /></i>
            <p>{workspace?.run?.status === "waiting" ? "媒体任务优先，小说会在空闲后自动继续。" : "每次只生成少量章节，离开页面也能从游标恢复。"}</p>
          </div>
          <nav>
            {volumeChapters.map(({ volume, chapters }) => (
              <details key={volume.id} open>
                <summary>
                  <span>{volume.title}</span>
                  <small>{chapters.length} 章</small>
                </summary>
                <ol>
                  {chapters.map((chapter) => (
                    <li key={chapter.id}>
                      <button
                        type="button"
                        className={chapter.id === selectedChapterId ? "is-active" : ""}
                        onClick={() => selectChapter(chapter)}
                      >
                        <span>{String(chapter.number).padStart(2, "0")}</span>
                        <b>{chapter.title}</b>
                        <small className={`status-${chapter.status}`}>{STATUS_LABEL[chapter.status] ?? chapter.status}</small>
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
            ))}
          </nav>
        </aside>

        <section className={`novel-editor ${mobilePane === "editor" ? "is-mobile-active" : ""}`} aria-label="章节正文">
          {selectedChapter ? (
            <>
              <header className="novel-editor-head">
                <div>
                  <span>第 {selectedChapter.number} 章 · 来源第 {selectedChapter.sourceEpisode} 集</span>
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    aria-label="章节标题"
                    maxLength={120}
                  />
                </div>
                <div className="novel-editor-actions">
                  <span className={dirty ? "is-dirty" : ""}>{wordCount(draftContent).toLocaleString("zh-CN")} 字</span>
                  <button type="button" onClick={regenerateChapter} disabled={busy}>重写本章</button>
                  <button type="button" className="is-primary" onClick={saveChapter} disabled={busy || !dirty}>
                    <Icon name="check" />保存
                  </button>
                </div>
              </header>
              <div className="novel-outline-field">
                <label htmlFor="novel-outline">本章推进</label>
                <textarea
                  id="novel-outline"
                  value={draftOutline}
                  onChange={(event) => setDraftOutline(event.target.value)}
                  rows={3}
                />
              </div>
              <div className="novel-paper">
                {draftContent ? (
                  <textarea
                    value={draftContent}
                    onChange={(event) => setDraftContent(event.target.value)}
                    spellCheck={false}
                    aria-label="章节正文"
                    placeholder="开始写这一章…"
                  />
                ) : (
                  <div className="novel-empty-chapter">
                    <span><Icon name="book" /></span>
                    <h2>这一章还没有正文</h2>
                    <p>可以直接开始写，也可以交给小说任务按顺序生成。</p>
                    <button type="button" onClick={() => setBudgetOpen(true)}>确认并开始生成</button>
                  </div>
                )}
              </div>
              <footer className="novel-editor-foot">
                <span>目标 {formatNumber(selectedChapter.targetWords)} 字</span>
                <span>当前 r{selectedChapter.revision}</span>
                <span>{dirty ? "有未保存修改" : "已保存"}</span>
              </footer>
            </>
          ) : (
            <div className="novel-empty-chapter">
              <span><Icon name="book" /></span>
              <h2>还没有章节</h2>
              <p>先规划目录，再选择章节开始编辑。</p>
            </div>
          )}
        </section>

        <aside className={`novel-inspector ${mobilePane === "inspect" ? "is-mobile-active" : ""}`} aria-label="小说检查">
          <section>
            <header>
              <span>质量检查</span>
              <b className={audit?.blocking ? "has-blocking" : ""}>
                {audit ? `${audit.blocking} 阻断 · ${audit.warning} 提醒` : "尚未检查"}
              </b>
            </header>
            {audit && audit.issues.length > 0 ? (
              <ul className="novel-audit-list">
                {audit.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className={issue.severity === "blocking" ? "is-blocking" : ""}>
                    <span>{issue.severity === "blocking" ? "阻断" : "提醒"}</span>
                    <p>{issue.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="novel-inspect-empty">
                {selectedChapter?.content ? "没有发现确定性质量问题。" : "章节生成后会自动检查工程词、重复句式和截断。"}
              </p>
            )}
            <button
              className="novel-inspect-action"
              type="button"
              disabled={busy || !selectedChapter?.content.trim()}
              onClick={previewDeslop}
            >
              <Icon name="spark" />生成去 AI 味修订稿
            </button>
          </section>

          {deslop && (
            <section className="novel-deslop-preview">
              <header>
                <span>待确认修订</span>
                <small>{deslop.notes.length} 项调整</small>
              </header>
              <p>{deslop.content.slice(0, 360)}{deslop.content.length > 360 ? "…" : ""}</p>
              <div>
                <button type="button" onClick={() => setDeslop(null)}>放弃</button>
                <button type="button" onClick={applyDeslop} disabled={busy}>写入新版本</button>
              </div>
            </section>
          )}

          <section>
            <header>
              <span>项目事实</span>
              <b>复用中</b>
            </header>
            <dl className="novel-facts">
              <div><dt>来源集数</dt><dd>{workspace?.upstream.episodeCount ?? 0}</dd></div>
              <div><dt>已写章节</dt><dd>{completed}</dd></div>
              <div><dt>计划章节</dt><dd>{total}</dd></div>
              <div><dt>篇幅</dt><dd>{workspace ? novelPresetLabel(workspace.edition.preset) : "未选择"}</dd></div>
            </dl>
            <p className="novel-canon-note">人物、三观、场次、Canon 和原文会随章节上下文注入；制作提示词与参考图不会进入正文。</p>
          </section>
        </aside>
      </div>

      {budgetOpen && activePreset && estimate && (
        <div className="novel-dialog-scrim" role="presentation" onClick={() => setBudgetOpen(false)}>
          <section
            className="novel-budget-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="novel-budget-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <span>生成前确认</span>
              <button type="button" onClick={() => setBudgetOpen(false)} aria-label="关闭">×</button>
            </header>
            <h2 id="novel-budget-title">{activePreset.label}</h2>
            <p>目录已按当前 {workspace?.upstream.episodeCount ?? 0} 集剧情规划完成。开始后按章节排队生成，媒体任务优先。</p>
            <div className="novel-budget-grid">
              <div><span>章节</span><b>{estimate.chapters}</b></div>
              <div><span>目标字数</span><b>{(estimate.wordsMin / 10_000).toFixed(0)}-{(estimate.wordsMax / 10_000).toFixed(0)} 万</b></div>
              <div><span>输出 Token</span><b>{(estimate.outputTokensMin / 10_000).toFixed(0)}-{(estimate.outputTokensMax / 10_000).toFixed(0)} 万</b></div>
              <div><span>平台额度</span><b>{estimate.quotaUnits} 单位</b></div>
              <div><span>预计耗时</span><b>{estimate.durationLabel}</b></div>
              <div><span>优先级</span><b>低于媒体任务</b></div>
            </div>
            <p className="novel-budget-notice">{estimate.notice}</p>
            <footer>
              <button type="button" onClick={() => setBudgetOpen(false)}>暂不开始</button>
              <button type="button" className="is-primary" onClick={startGeneration} disabled={busy}>
                确认并开始
              </button>
            </footer>
          </section>
        </div>
      )}

      {notice && (
        <div className="novel-toast" role="status" aria-live="polite">
          <p>{notice}</p>
          <button type="button" onClick={() => setNotice(null)}>知道了</button>
        </div>
      )}
    </main>
  )
}
