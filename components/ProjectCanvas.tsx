'use client'

// 项目画布：先看全局与节点内容，再进入现有工作台编辑。
// 六步是线性的，资产（定妆 / 地点）向下分支，最终汇入分镜。
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { StepKey } from '@/lib/types'
import { filterCanvasItems, paginateCanvasItems } from '@/lib/canvas-view'
import type { SnapshotDto } from '@/lib/assets/api'

export type CanvasNodeId = StepKey | 'places'

export interface CanvasEditOption {
  field: string
  label: string
  value: string
  maxLength: number
  rows?: number
}

export interface CanvasPreviewItem {
  id: string
  title: string
  meta?: string
  note?: string
  missing?: boolean
  edit?: CanvasEditOption
}

export interface CanvasPreview {
  summary: string
  items: CanvasPreviewItem[]
}

interface Counts {
  characters: number
  acts: number
  episodes: number
  visuals: number
  scenes: number
  shots: number
  places: number
  placeGaps: number
}

interface Props {
  current: StepKey
  completed: Record<StepKey, boolean>
  counts: Counts
  issues: Partial<Record<StepKey, number>>
  previews: Partial<Record<CanvasNodeId, CanvasPreview>>
  onEdit: (node: CanvasNodeId, itemId: string, field: string, value: string, mode: 'edit' | 'undo') => Promise<void>
  onLoadVersions: (node: CanvasNodeId) => Promise<SnapshotDto[]>
  onRestoreVersion: (node: CanvasNodeId, payload: unknown) => Promise<void>
  onOpen: (step: StepKey) => void
  onAskAgent: (step: StepKey, label: string) => void
  onClose: () => void
}

interface NodeDef {
  id: CanvasNodeId
  target: StepKey
  index: number | null
  label: string
  count: number
  unit: string
  x: number
  y: number
  issue?: number
}

interface SavedEdit {
  node: CanvasNodeId
  itemId: string
  itemLabel: string
  fieldLabel: string
  field: string
  previous: string
}

const NODE_W = 168
const NODE_H = 92
const PREVIEW_PAGE_SIZE = 8
const PREVIEW_FILTER_MIN = 4
const BOARD_W = 1200
const BOARD_H = 420
const MIN_ZOOM = 0.45
const MAX_ZOOM = 1.8

function formatVersionTime(at: number): string {
  return new Date(at).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function versionSize(payload: unknown): string {
  if (Array.isArray(payload)) return `${payload.length} 条`
  return payload && typeof payload === 'object' ? '对象' : '空'
}

function nodesOf({ counts, issues }: { counts: Counts; issues: Props['issues'] }): NodeDef[] {
  return [
    { id: 'characters', target: 'characters', index: 1, label: '核心人物', count: counts.characters, unit: '个角色', x: 32, y: 70, issue: issues.characters },
    { id: 'acts', target: 'acts', index: 2, label: '三幕大纲', count: counts.acts, unit: '幕', x: 250, y: 70, issue: issues.acts },
    { id: 'episodes', target: 'episodes', index: 3, label: '分集剧情', count: counts.episodes, unit: '集', x: 468, y: 70, issue: issues.episodes },
    { id: 'scenes', target: 'scenes', index: 5, label: '场景', count: counts.scenes, unit: '场', x: 686, y: 70, issue: issues.scenes },
    { id: 'shots', target: 'shots', index: 6, label: '分镜', count: counts.shots, unit: '镜', x: 904, y: 70, issue: issues.shots },
    { id: 'visuals', target: 'visuals', index: 4, label: '视觉定妆', count: counts.visuals, unit: '人', x: 250, y: 250, issue: issues.visuals },
    { id: 'places', target: 'scenes', index: null, label: '地点锚点', count: counts.places, unit: '处', x: 468, y: 250, issue: counts.placeGaps },
  ]
}

export default function ProjectCanvas({
  current,
  completed,
  counts,
  issues,
  previews,
  onEdit,
  onLoadVersions,
  onRestoreVersion,
  onOpen,
  onAskAgent,
  onClose,
}: Props) {
  const overlay = useRef<HTMLDivElement | null>(null)
  const stage = useRef<HTMLDivElement | null>(null)
  const closeButton = useRef<HTMLButtonElement | null>(null)
  const inspectorClose = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef(onClose)
  const selectedRef = useRef<CanvasNodeId | null>(null)
  const editingRef = useRef<string | null>(null)
  const historyOpenRef = useRef(false)
  const [selected, setSelected] = useState<CanvasNodeId | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [lastSaved, setLastSaved] = useState<SavedEdit | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewQuery, setPreviewQuery] = useState('')
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [previewPage, setPreviewPage] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory] = useState<SnapshotDto[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null)
  const interactedRef = useRef(false)
  closeRef.current = onClose
  selectedRef.current = selected
  editingRef.current = editingItemId
  historyOpenRef.current = historyOpen
  const nodes = nodesOf({ counts, issues })
  const selectedNode = selected ? nodes.find((node) => node.id === selected) ?? null : null
  const preview = selected ? previews[selected] : undefined
  const filteredPreviewItems = useMemo(
    () => filterCanvasItems(preview?.items ?? [], previewQuery, issuesOnly),
    [preview?.items, previewQuery, issuesOnly],
  )
  const previewPageData = useMemo(
    () => paginateCanvasItems(filteredPreviewItems, previewPage, PREVIEW_PAGE_SIZE),
    [filteredPreviewItems, previewPage],
  )
  const pageDataItems = previewPageData.items

  function fitCanvas() {
    const el = stage.current
    if (!el) return
    const pad = 44
    const next = Math.max(
      MIN_ZOOM,
      Math.min(MAX_ZOOM, (el.clientWidth - pad) / BOARD_W, (el.clientHeight - pad) / BOARD_H, 1.15),
    )
    setZoom(next)
    setPan({
      x: (el.clientWidth - BOARD_W * next) / 2,
      y: (el.clientHeight - BOARD_H * next) / 2,
    })
    interactedRef.current = false
  }

  function zoomCanvas(factor: number) {
    const el = stage.current
    if (!el) return
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor))
    if (next === zoom) return
    const ratio = next / zoom
    const centerX = el.clientWidth / 2
    const centerY = el.clientHeight / 2
    setPan({
      x: centerX - (centerX - pan.x) * ratio,
      y: centerY - (centerY - pan.y) * ratio,
    })
    setZoom(next)
    interactedRef.current = true
  }

  function startPan(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.currentTarget.focus({ preventScroll: true })
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    interactedRef.current = true
    setDragging(true)
  }

  function movePan(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    setPan({
      x: drag.panX + e.clientX - drag.startX,
      y: drag.panY + e.clientY - drag.startY,
    })
  }

  function endPan(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  function handleCanvasKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return
    const step = e.shiftKey ? 96 : 32
    if (e.key === 'ArrowLeft') setPan((current) => ({ ...current, x: current.x - step }))
    else if (e.key === 'ArrowRight') setPan((current) => ({ ...current, x: current.x + step }))
    else if (e.key === 'ArrowUp') setPan((current) => ({ ...current, y: current.y - step }))
    else if (e.key === 'ArrowDown') setPan((current) => ({ ...current, y: current.y + step }))
    else if (e.key === '+' || e.key === '=') zoomCanvas(1.15)
    else if (e.key === '-') zoomCanvas(0.87)
    else if (e.key === '0') fitCanvas()
    else return
    interactedRef.current = true
    e.preventDefault()
  }

  function clearSelection() {
    const id = selectedRef.current
    selectedRef.current = null
    editingRef.current = null
    setSelected(null)
    setEditingItemId(null)
    setDraft('')
    setLastSaved(null)
    setSaveError(null)
    setPreviewQuery('')
    setIssuesOnly(false)
    setPreviewPage(0)
    setHistoryOpen(false)
    setHistory([])
    setHistoryError(null)
    setRestoreNotice(null)
    if (!id) return
    window.requestAnimationFrame(() => {
      const candidates = [...(overlay.current?.querySelectorAll<HTMLElement>(`[data-map-node="${id}"]`) ?? [])]
      candidates.find((el) => el.offsetParent !== null)?.focus()
    })
  }

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const background = [...(overlay.current?.parentElement?.children ?? [])]
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el !== overlay.current)
      .map((el) => ({
        el,
        inert: el.getAttribute('inert'),
        ariaHidden: el.getAttribute('aria-hidden'),
      }))
    document.body.style.overflow = 'hidden'
    for (const item of background) {
      item.el.setAttribute('inert', '')
      item.el.setAttribute('aria-hidden', 'true')
    }
    closeButton.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (editingRef.current) cancelEdit()
        else if (historyOpenRef.current) setHistoryOpen(false)
        else if (selectedRef.current) clearSelection()
        else closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !overlay.current) return

      const focusable = [...overlay.current.querySelectorAll<HTMLElement>('button:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
        .filter((el) => el.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      for (const item of background) {
        if (item.inert === null) item.el.removeAttribute('inert')
        else item.el.setAttribute('inert', item.inert)
        if (item.ariaHidden === null) item.el.removeAttribute('aria-hidden')
        else item.el.setAttribute('aria-hidden', item.ariaHidden)
      }
      previousFocus?.focus()
    }
  }, [])

  useEffect(() => {
    if (selected) inspectorClose.current?.focus()
  }, [selected])

  useEffect(() => {
    if (previewPageData.page !== previewPage) setPreviewPage(previewPageData.page)
  }, [previewPage, previewPageData.page])

  useEffect(() => {
    if (!lastSaved) return
    const timer = window.setTimeout(() => setLastSaved(null), 4500)
    return () => window.clearTimeout(timer)
  }, [lastSaved])

  useEffect(() => {
    const refit = () => {
      if (!interactedRef.current) fitCanvas()
    }
    refit()
    const ro = new ResizeObserver(refit)
    if (stage.current) ro.observe(stage.current)
    window.addEventListener('resize', refit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', refit)
    }
  }, [])

  const statusOf = (n: NodeDef) => {
    if (n.count <= 0) return 'empty'
    if (n.issue && n.issue > 0) return 'partial'
    if (n.id === 'places' || completed[n.target]) return 'done'
    return 'partial'
  }

  const statusLabel = (n: NodeDef) => {
    const status = statusOf(n)
    if (status === 'done') return '已完成'
    if (status === 'partial') return '待补齐'
    return '未生成'
  }

  const issueLabel = (n: NodeDef) => {
    if (!n.issue) return ''
    if (n.id === 'characters') return `${n.issue} 项待补`
    if (n.id === 'acts') return `还差 ${n.issue} 幕`
    if (n.id === 'episodes') return `${n.issue} 集钩子待补`
    if (n.id === 'visuals') return `${n.issue} 人视觉待处理`
    if (n.id === 'scenes') return `${n.issue} 场待补`
    if (n.id === 'shots') return `${n.issue} 镜待处理`
    return `${n.issue} 处待补`
  }

  function selectNode(id: CanvasNodeId) {
    selectedRef.current = id
    editingRef.current = null
    setSelected(id)
    setEditingItemId(null)
    setDraft('')
    setLastSaved(null)
    setPreviewQuery('')
    setIssuesOnly(false)
    setPreviewPage(0)
    setHistoryOpen(false)
    setHistory([])
    setHistoryError(null)
    setRestoreNotice(null)
  }

  async function toggleHistory() {
    if (historyOpen) {
      setHistoryOpen(false)
      return
    }
    if (!selected) return
    const node = selected
    setHistoryOpen(true)
    setHistoryLoading(true)
    setHistoryError(null)
    setRestoreNotice(null)
    try {
      setHistory(await onLoadVersions(node))
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : '版本读取失败，请重试')
    } finally {
      setHistoryLoading(false)
    }
  }

  async function restoreVersion(version: SnapshotDto) {
    if (!selected || restoringId) return
    const node = selected
    setRestoringId(version.id)
    setHistoryError(null)
    try {
      await onRestoreVersion(node, version.payload)
      const next = await onLoadVersions(node)
      setHistory(next)
      setRestoreNotice(`已恢复 v${version.version}，并生成了一版新记录。`)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : '恢复失败，请重试')
    } finally {
      setRestoringId(null)
    }
  }

  function startEdit(item: CanvasPreviewItem) {
    if (!item.edit) return
    editingRef.current = item.id
    setEditingItemId(item.id)
    setDraft(item.edit.value)
    setLastSaved(null)
    setSaveError(null)
  }

  function cancelEdit() {
    const id = editingRef.current
    editingRef.current = null
    setEditingItemId(null)
    setDraft('')
    setSaveError(null)
    if (!id) return
    window.requestAnimationFrame(() => {
      const candidates = [...(overlay.current?.querySelectorAll<HTMLElement>(`[data-map-edit="${id}"]`) ?? [])]
      candidates.find((el) => el.offsetParent !== null)?.focus()
    })
  }

  async function saveEdit(item: CanvasPreviewItem) {
    if (!selected || !item.edit || savingEdit) return
    const next = draft.trim()
    if (next === item.edit.value.trim()) return
    const saved: SavedEdit = {
      node: selected,
      itemId: item.id,
      itemLabel: item.title,
      fieldLabel: item.edit.label,
      field: item.edit.field,
      previous: item.edit.value,
    }
    setSavingEdit(true)
    setSaveError(null)
    try {
      await onEdit(selected, item.id, item.edit.field, next, 'edit')
      setLastSaved(saved)
      const id = item.id
      editingRef.current = null
      setEditingItemId(null)
      setDraft('')
      window.requestAnimationFrame(() => {
        const candidates = [...(overlay.current?.querySelectorAll<HTMLElement>(`[data-map-edit="${id}"]`) ?? [])]
        candidates.find((el) => el.offsetParent !== null)?.focus()
      })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败，请重试')
    } finally {
      setSavingEdit(false)
    }
  }

  async function undoLastEdit() {
    if (!lastSaved || savingEdit) return
    setSavingEdit(true)
    setSaveError(null)
    try {
      await onEdit(lastSaved.node, lastSaved.itemId, lastSaved.field, lastSaved.previous, 'undo')
      const id = lastSaved.itemId
      setLastSaved(null)
      window.requestAnimationFrame(() => {
        const candidates = [...(overlay.current?.querySelectorAll<HTMLElement>(`[data-map-edit="${id}"]`) ?? [])]
        candidates.find((el) => el.offsetParent !== null)?.focus()
      })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '撤销失败，请重试')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div
      className={`map-overlay ${selected ? 'has-inspector' : ''}`}
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-canvas-title"
      aria-describedby="project-canvas-desc"
    >
      <div className="map-bar">
        <b id="project-canvas-title">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="6" r="2.2" />
            <circle cx="19" cy="6" r="2.2" />
            <circle cx="12" cy="18" r="2.2" />
            <path d="M7.2 6h9.6M6.2 8l4.6 8M17.8 8l-4.6 8" />
          </svg>
          项目画布
        </b>
        <span id="project-canvas-desc">点节点查看内容与缺口，关键字段可直接修改，完整编辑回到工作台</span>
        <button ref={closeButton} type="button" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
          返回工作台
        </button>
      </div>

      <div className="map-workspace">
        <div className="map-map-pane">
          <div
            className={`map-stage-wrap canvas-viewport ${dragging ? 'dragging' : ''}`}
            ref={stage}
            aria-label="项目节点画布"
            role="region"
            tabIndex={0}
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight + - 0"
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onKeyDown={handleCanvasKeyDown}
          >
            <div
              className="map-canvas canvas-board"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              <svg className="map-links" viewBox="0 0 1200 420" aria-hidden="true">
                <defs>
                  <marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" />
                  </marker>
                </defs>
                <path d="M200 116 H242" markerEnd="url(#map-arrow)" />
                <path d="M418 116 H460" markerEnd="url(#map-arrow)" />
                <path d="M636 116 H678" markerEnd="url(#map-arrow)" />
                <path d="M854 116 H896" markerEnd="url(#map-arrow)" />
                <path d="M116 162 V206 H334 V242" markerEnd="url(#map-arrow)" />
                <path d="M552 162 V242" markerEnd="url(#map-arrow)" />
                <path d="M334 342 V372 H988 V168" markerEnd="url(#map-arrow)" />
                <path d="M552 342 V372" />
              </svg>

              {nodes.map((n) => {
                const status = statusOf(n)
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`map-node ${status} ${n.id === current ? 'current' : ''} ${n.id === selected ? 'selected' : ''}`}
                    style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                    onClick={() => selectNode(n.id)}
                    data-map-node={n.id}
                    aria-label={`查看${n.label}节点`}
                    aria-pressed={n.id === selected}
                  >
                    <span className="map-node-head">
                      {n.index !== null && <em>{String(n.index).padStart(2, '0')}</em>}
                      <b>{n.label}</b>
                      <i aria-hidden="true" />
                    </span>
                    <span className="map-node-count">
                      {n.count > 0 ? `${n.count} ${n.unit}` : '未生成'}
                    </span>
                    {n.issue ? <span className="map-node-issue">{issueLabel(n)}</span> : null}
                  </button>
                )
              })}
            </div>

            <div className="canvas-controls" role="group" aria-label="画布缩放">
              <button type="button" onClick={() => zoomCanvas(0.8)} title="缩小" aria-label="缩小画布">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M5 10h10" />
                </svg>
              </button>
              <span aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => zoomCanvas(1.25)} title="放大" aria-label="放大画布">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M5 10h10M10 5v10" />
                </svg>
              </button>
              <button type="button" className="fit" onClick={fitCanvas} title="适应视图" aria-label="让画布适应视图">
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M7 4H4v3M13 4h3v3M7 16H4v-3M13 16h3v-3" />
                </svg>
                适应
              </button>
            </div>
          </div>

          {/* 窄屏：同一份数据改成纵向列表，避免缩到看不清 */}
          <ul className="map-list">
            {nodes.map((n) => {
              const status = statusOf(n)
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`map-row ${status} ${n.id === selected ? 'selected' : ''}`}
                    onClick={() => selectNode(n.id)}
                    data-map-node={n.id}
                    aria-pressed={n.id === selected}
                  >
                    <em>{n.index !== null ? String(n.index).padStart(2, '0') : '—'}</em>
                    <b>{n.label}</b>
                    <span>{n.count > 0 ? `${n.count} ${n.unit}` : '未生成'}</span>
                    {n.issue ? <i>{issueLabel(n)}</i> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {selectedNode && (
          <aside className="map-inspector" aria-labelledby="map-inspector-title">
            <div className="map-inspector-head">
              <div>
                <span>NODE {selectedNode.index !== null ? String(selectedNode.index).padStart(2, '0') : 'ASSET'}</span>
                <h2 id="map-inspector-title">{selectedNode.label}</h2>
              </div>
              <button
                ref={inspectorClose}
                type="button"
                className="map-inspector-close"
                onClick={clearSelection}
                aria-label="关闭节点详情"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="map-inspector-state">
              <span className={`map-state ${statusOf(selectedNode)}`}>
                <i aria-hidden="true" />
                {statusLabel(selectedNode)}
              </span>
              <span className="map-state-right">
                <span>{selectedNode.count > 0 ? `${selectedNode.count} ${selectedNode.unit}` : '还没有内容'}</span>
                <button
                  type="button"
                  className="map-history-toggle"
                  aria-expanded={historyOpen}
                  onClick={() => { void toggleHistory() }}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M4 6.5h12M4 10h12M4 13.5h8" />
                  </svg>
                  {historyOpen ? '返回' : '版本'}
                </button>
              </span>
            </div>

            {preview?.summary && <p className="map-inspector-summary">{preview.summary}</p>}
            {selectedNode.issue ? (
              <p className="map-inspector-issue">{issueLabel(selectedNode)}，可先在这里补关键字段，其余进入工作台处理。</p>
            ) : null}

            {historyOpen ? (
              <div className="map-history">
                {historyError && <p className="map-history-error" role="alert">{historyError}</p>}
                {historyLoading ? (
                  <div className="map-history-loading">读取版本…</div>
                ) : history.length ? (
                  <div className="map-history-list">
                    {history.map((version, index) => (
                      <div key={version.id} className={`map-history-row ${index === 0 ? 'current' : ''}`}>
                        <div>
                          <div className="map-history-title">
                            <b>v{version.version}</b>
                            {index === 0 && <span>当前</span>}
                          </div>
                          <p>{formatVersionTime(version.createdAt)} · {versionSize(version.payload)}</p>
                        </div>
                        {index === 0 ? (
                          <span className="map-history-current">已载入</span>
                        ) : (
                          <button
                            type="button"
                            disabled={restoringId !== null}
                            onClick={() => { void restoreVersion(version) }}
                          >
                            {restoringId === version.id ? '恢复中…' : '恢复此版'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="map-history-loading">这个节点还没有保存版本。</div>
                )}
                {restoreNotice && <p className="map-history-notice" role="status">{restoreNotice}</p>}
              </div>
            ) : (
              <>
            {preview && preview.items.length > PREVIEW_FILTER_MIN && (
              <div className="canvas-preview-tools">
                <div className="canvas-preview-search">
                  <label className="sr-only" htmlFor="canvas-preview-search">搜索画布详情</label>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="8.5" cy="8.5" r="4.5" />
                    <path d="m12 12 4 4" />
                  </svg>
                  <input
                    id="canvas-preview-search"
                    type="search"
                    value={previewQuery}
                    placeholder="搜索标题、集数或内容"
                    onChange={(e) => {
                      setPreviewQuery(e.target.value)
                      setPreviewPage(0)
                    }}
                  />
                  {previewQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewQuery('')
                        setPreviewPage(0)
                      }}
                      aria-label="清除搜索"
                    >
                      <svg viewBox="0 0 20 20" aria-hidden="true">
                        <path d="m5 5 10 10M15 5 5 15" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="canvas-preview-filterbar">
                  <div className="canvas-preview-filter" role="group" aria-label="筛选画布详情">
                    <button
                      type="button"
                      className={!issuesOnly ? 'on' : ''}
                      aria-pressed={!issuesOnly}
                      onClick={() => {
                        setIssuesOnly(false)
                        setPreviewPage(0)
                      }}
                    >
                      全部
                    </button>
                    <button
                      type="button"
                      className={issuesOnly ? 'on' : ''}
                      aria-pressed={issuesOnly}
                      onClick={() => {
                        setIssuesOnly(true)
                        setPreviewPage(0)
                      }}
                    >
                      待补
                    </button>
                  </div>
                  <span className="canvas-preview-count">{filteredPreviewItems.length} 条</span>
                </div>
              </div>
            )}

            <div className="map-preview-list">
              {pageDataItems.length ? (
                pageDataItems.map((item) => (
                  <div key={item.id} className={`map-preview-row ${item.missing ? 'missing' : ''}`}>
                    <div className="map-preview-head">
                      <div className="map-preview-title">
                        <b>{item.title}</b>
                        {item.missing && <span>待补</span>}
                      </div>
                      {item.edit && (
                        <button
                          type="button"
                          className="map-preview-edit"
                          data-map-edit={item.id}
                          onClick={() => startEdit(item)}
                          aria-label={`编辑${item.title}的${item.edit.label}`}
                          aria-expanded={editingItemId === item.id}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="m14.5 5.5 4 4M5 19l3.5-.8L19.2 7.5a1.7 1.7 0 0 0 0-2.4l-.3-.3a1.7 1.7 0 0 0-2.4 0L5.8 15.5 5 19Z" />
                          </svg>
                          编辑
                        </button>
                      )}
                    </div>
                    {item.meta && <span className="map-preview-meta">{item.meta}</span>}
                    {item.note && <p>{item.note}</p>}
                    {editingItemId === item.id && item.edit && (
                      <div className="map-inline-edit">
                        <label htmlFor={`map-edit-${selected}-${item.id}`}>
                          编辑{item.edit.label}
                        </label>
                        <textarea
                          id={`map-edit-${selected}-${item.id}`}
                          value={draft}
                          maxLength={item.edit.maxLength}
                          rows={item.edit.rows ?? 3}
                          disabled={savingEdit}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                              e.preventDefault()
                              saveEdit(item)
                            }
                          }}
                          autoFocus
                        />
                        <div className="map-inline-actions">
                          <span>{draft.length}/{item.edit.maxLength}</span>
                          <button type="button" disabled={savingEdit} onClick={cancelEdit}>取消</button>
                          <button
                            type="button"
                            className="save"
                            disabled={savingEdit || draft.trim() === item.edit.value.trim()}
                            onClick={() => saveEdit(item)}
                          >
                            {savingEdit ? '保存中…' : '保存'}
                          </button>
                        </div>
                        {saveError && <p className="map-inline-error" role="alert">{saveError}</p>}
                      </div>
                    )}
                  </div>
                ))
              ) : preview?.items.length ? (
                <div className="map-preview-empty">
                  <b>没有匹配的条目</b>
                  <p>换个关键词，或者清除筛选后再看。</p>
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewQuery('')
                      setIssuesOnly(false)
                      setPreviewPage(0)
                    }}
                  >
                    清除筛选
                  </button>
                </div>
              ) : (
                <div className="map-preview-empty">
                  <b>这一步还没有内容</b>
                  <p>进入工作台生成后，节点和这里的内容会一起更新。</p>
                </div>
              )}
            </div>

            {preview && preview.items.length > PREVIEW_FILTER_MIN && previewPageData.pageCount > 1 && (
              <div className="canvas-preview-pagination">
                <button
                  type="button"
                  disabled={previewPageData.page === 0}
                  onClick={() => setPreviewPage((page) => Math.max(0, page - 1))}
                  aria-label="上一页"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m12 5-5 5 5 5" />
                  </svg>
                </button>
                <span>{previewPageData.page + 1} / {previewPageData.pageCount}</span>
                <button
                  type="button"
                  disabled={previewPageData.page >= previewPageData.pageCount - 1}
                  onClick={() => setPreviewPage((page) => Math.min(previewPageData.pageCount - 1, page + 1))}
                  aria-label="下一页"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m8 5 5 5-5 5" />
                  </svg>
                </button>
              </div>
            )}
              </>
            )}

            {lastSaved && (
              <div className="map-save-feedback" role="status">
                <span>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m4.5 10.5 3.3 3.3 7.7-8" />
                  </svg>
                  已保存「{lastSaved.fieldLabel}」
                </span>
                <button type="button" disabled={savingEdit} onClick={undoLastEdit}>
                  {savingEdit ? '处理中…' : '撤销'}
                </button>
              </div>
            )}

            <div className="map-inspector-foot">
              <button
                type="button"
                className="map-ask-agent"
                onClick={() => onAskAgent(selectedNode.target, selectedNode.label)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3.5v3M5 10.5h14v8H5zM8.5 14h.01M15.5 14h.01M9 17h6" />
                </svg>
                问场记这个节点
              </button>
              <button type="button" className="map-open-step" onClick={() => onOpen(selectedNode.target)}>
                进入「{selectedNode.label}」继续编辑
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 12h13M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
