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
import {
  buildCanvasActionQueue,
  filterCanvasItems,
  paginateCanvasItems,
  summarizeCanvasTasks,
  type CanvasAction,
} from '@/lib/canvas-view'
import type { SnapshotDto } from '@/lib/assets/api'
import { fetchProjectGenerationAssets } from '@/lib/generation/client'
import type { GeneratedAsset, GenerationTask } from '@/lib/generation/types'
import type { WorkspaceMode } from '@/lib/app-nav'
import ProductionMap from './ProductionMap'
import CanvasGraphWorkspace from './CanvasGraphWorkspace'
import WorkspaceModeTabs from './WorkspaceModeTabs'

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
  targetId?: string
  title: string
  meta?: string
  note?: string
  missing?: boolean
  episode?: number
  scene?: string
  shotNumber?: number
  status?: string
  duration?: number
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
  projectId: string | null
  projectTitle: string
  currentStepLabel: string
  /** 顶层「画布」模式默认落到真实可拖拽的编排画布。 */
  initialMode?: 'production' | 'flow' | 'graph'
  /** 画布是全屏覆盖层，但三种全局模式仍要在顶栏可见、可切换。 */
  workspaceMode?: WorkspaceMode
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void
  onEdit: (node: CanvasNodeId, itemId: string, field: string, value: string, mode: 'edit' | 'undo') => Promise<void>
  onLoadVersions: (node: CanvasNodeId) => Promise<SnapshotDto[]>
  onRestoreVersion: (node: CanvasNodeId, payload: unknown) => Promise<void>
  onOpen: (step: StepKey) => void
  onOpenItem: (node: CanvasNodeId, itemId: string) => void
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
const LIST_NODE_ORDER: CanvasNodeId[] = [
  'characters',
  'acts',
  'episodes',
  'visuals',
  'scenes',
  'places',
  'shots',
]

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
  projectId,
  projectTitle,
  currentStepLabel,
  initialMode = 'production',
  workspaceMode,
  onWorkspaceModeChange,
  onEdit,
  onLoadVersions,
  onRestoreVersion,
  onOpen,
  onOpenItem,
  onAskAgent,
  onClose,
}: Props) {
  const overlay = useRef<HTMLDivElement | null>(null)
  const stage = useRef<HTMLDivElement | null>(null)
  const closeButton = useRef<HTMLButtonElement | null>(null)
  const inspectorClose = useRef<HTMLButtonElement | null>(null)
  const closeRef = useRef(onClose)
  const openRef = useRef(onOpen)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closingRef = useRef(false)
  const selectedRef = useRef<CanvasNodeId | null>(null)
  const editingRef = useRef<string | null>(null)
  const historyOpenRef = useRef(false)
  const [selected, setSelected] = useState<CanvasNodeId | null>(null)
  const [closing, setClosing] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [lastSaved, setLastSaved] = useState<SavedEdit | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [previewQuery, setPreviewQuery] = useState('')
  const [previewEpisode, setPreviewEpisode] = useState<number | null>(null)
  const [previewScene, setPreviewScene] = useState<string | null>(null)
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [previewPage, setPreviewPage] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory] = useState<SnapshotDto[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null)
  const [generationTasks, setGenerationTasks] = useState<GenerationTask[]>([])
  const [generationAssets, setGenerationAssets] = useState<GeneratedAsset[]>([])
  const [mapMode, setMapMode] = useState<'production' | 'flow' | 'graph'>(initialMode)
  const [priorityExpanded, setPriorityExpanded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null)
  const interactedRef = useRef(false)
  closeRef.current = onClose
  openRef.current = onOpen
  selectedRef.current = selected
  editingRef.current = editingItemId
  historyOpenRef.current = historyOpen
  const nodes = nodesOf({ counts, issues })
  const listNodes = [...nodes].sort(
    (left, right) => LIST_NODE_ORDER.indexOf(left.id) - LIST_NODE_ORDER.indexOf(right.id),
  )
  const taskCounts = useMemo(
    () => summarizeCanvasTasks(generationTasks.map((task) => ({
      targetType: task.targetType,
      targetId: task.targetId,
      status: task.status,
    }))),
    [generationTasks],
  )
  const canvasActions = buildCanvasActionQueue(
    nodes.map((node) => ({
      id: node.id,
      label: node.label,
      issue: node.issue ?? 0,
      items: previews[node.id]?.items ?? [],
    })),
    generationTasks,
  )
  const runningTaskCount = Object.values(taskCounts).reduce((sum, count) => sum + (count?.running ?? 0), 0)
  const failedTaskCount = Object.values(taskCounts).reduce((sum, count) => sum + (count?.failed ?? 0), 0)
  const selectedNode = selected ? nodes.find((node) => node.id === selected) ?? null : null
  const selectedTask = selected ? taskCounts[selected] : undefined
  const preview = selected ? previews[selected] : undefined
  const episodeOptions = useMemo(
    () => [...new Set((preview?.items ?? []).flatMap((item) =>
      Number.isInteger(item.episode) ? [item.episode!] : []
    ))].sort((left, right) => left - right),
    [preview?.items],
  )
  const sceneOptions = useMemo(
    () => [...new Set((preview?.items ?? [])
      .filter((item) => previewEpisode === null || item.episode === previewEpisode)
      .flatMap((item) => item.scene ? [item.scene] : []))].sort(),
    [preview?.items, previewEpisode],
  )
  const filteredPreviewItems = useMemo(
    () => filterCanvasItems(preview?.items ?? [], previewQuery, issuesOnly, {
      episode: previewEpisode,
      scene: previewScene,
    }),
    [preview?.items, previewQuery, issuesOnly, previewEpisode, previewScene],
  )
  const previewPageData = useMemo(
    () => paginateCanvasItems(filteredPreviewItems, previewPage, PREVIEW_PAGE_SIZE),
    [filteredPreviewItems, previewPage],
  )
  const pageDataItems = previewPageData.items

  function requestClose(afterClose?: () => void) {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    closeTimerRef.current = setTimeout(() => {
      if (afterClose) afterClose()
      else closeRef.current()
    }, reduced ? 0 : 220)
  }

  function requestOpenStep(step: StepKey) {
    requestClose(() => openRef.current(step))
  }

  function switchMapMode(next: 'production' | 'flow' | 'graph') {
    if (next === mapMode) return
    if (selected) clearSelection()
    setMapMode(next)
  }

  function openCanvasAction(action: CanvasAction) {
    const node = action.node as CanvasNodeId
    if (action.itemId) {
      requestClose(() => onOpenItem(node, action.itemId!))
      return
    }
    requestOpenStep(node === 'places' ? 'scenes' : node as StepKey)
  }

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
    setPreviewEpisode(null)
    setPreviewScene(null)
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
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

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
        else requestClose()
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
    if (!projectId) {
      setGenerationTasks([])
      setGenerationAssets([])
      return
    }
    let active = true
    const load = () => {
      fetchProjectGenerationAssets(projectId)
        .then((state) => {
          if (active) {
            setGenerationTasks(state.tasks)
            setGenerationAssets(state.assets)
          }
        })
        .catch(() => {
          if (active) {
            setGenerationTasks([])
            setGenerationAssets([])
          }
        })
    }
    load()
    window.addEventListener('chengju:generation-updated', load)
    return () => {
      active = false
      window.removeEventListener('chengju:generation-updated', load)
    }
  }, [projectId])

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
    setPreviewEpisode(null)
    setPreviewScene(null)
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
      className={`map-overlay ${selected ? 'has-inspector' : ''} ${closing ? 'is-closing' : ''}`}
      data-state={closing ? 'closing' : 'open'}
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-canvas-title"
      aria-describedby="project-canvas-desc"
    >
      <div className="map-bar">
        <h1 id="project-canvas-title">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="6" r="2.2" />
            <circle cx="19" cy="6" r="2.2" />
            <circle cx="12" cy="18" r="2.2" />
            <path d="M7.2 6h9.6M6.2 8l4.6 8M17.8 8l-4.6 8" />
          </svg>
          项目画布
        </h1>
        <span id="project-canvas-desc">先看优先处理，再点节点查看全貌、版本与关键字段</span>
        {workspaceMode && onWorkspaceModeChange && (
          <div className="canvas-mode-switch">
            <WorkspaceModeTabs
              mode={workspaceMode}
              onChange={(next) => {
                if (next === 'canvas') return
                requestClose(() => onWorkspaceModeChange(next))
              }}
            />
          </div>
        )}
        <div className="map-project-context" aria-label={`当前项目 ${projectTitle}，来源步骤 ${currentStepLabel}`}>
          <strong>{projectTitle}</strong>
          <i aria-hidden="true">·</i>
          <span>{currentStepLabel}</span>
        </div>
        <button ref={closeButton} type="button" onClick={() => requestClose()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
          <span>返回工作台</span>
        </button>
      </div>

      <div className="map-view-tabs" role="tablist" aria-label="画布视图">
        <button
          type="button"
          role="tab"
          aria-selected={mapMode === 'production'}
          className={mapMode === 'production' ? 'active' : ''}
          onClick={() => switchMapMode('production')}
        >
          制作地图
          <span>{counts.shots} 镜</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mapMode === 'flow'}
          className={mapMode === 'flow' ? 'active' : ''}
          onClick={() => switchMapMode('flow')}
        >
          六步流程
          <span>{Object.values(completed).filter(Boolean).length} / 6</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mapMode === 'graph'}
          className={mapMode === 'graph' ? 'active' : ''}
          onClick={() => switchMapMode('graph')}
        >
          编排画布
          <span>实时</span>
        </button>
      </div>

      {mapMode !== 'graph' && <section className={`map-priority ${canvasActions.length ? 'has-issues' : 'is-clear'}`} aria-label="优先处理">
        <div className="map-priority-head">
          <span>
            <i aria-hidden="true" />
            优先处理
          </span>
          <b>{canvasActions.length}</b>
          {runningTaskCount > 0 && <em>{runningTaskCount} 个任务运行中</em>}
          {failedTaskCount > 0 && <em className="failed">{failedTaskCount} 个失败</em>}
          {canvasActions.length > 6 && (
            <button
              type="button"
              className="map-priority-expand"
              aria-expanded={priorityExpanded}
              onClick={() => setPriorityExpanded((expanded) => !expanded)}
            >
              {priorityExpanded ? '收起' : `展开全部 ${canvasActions.length}`}
            </button>
          )}
        </div>
        {canvasActions.length > 0 ? (
          <div className="map-priority-list">
            {(priorityExpanded ? canvasActions : canvasActions.slice(0, 6)).map((action) => {
              const nodeLabel = nodes.find((node) => node.id === action.node)?.label ?? action.node
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => openCanvasAction(action)}
                  title={`定位到${nodeLabel}：${action.title}`}
                >
                  <span>
                    <small>{nodeLabel}</small>
                    <strong>{action.title}</strong>
                    <em>{action.reason}</em>
                  </span>
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m7.5 4.5 5 5-5 5" />
                  </svg>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="map-priority-clear">
            <span aria-hidden="true">✓</span>
            <p>{runningTaskCount > 0 ? '后台任务正在运行，当前没有待处理缺口' : '当前没有待处理项，可以继续检查版本或进入下一步'}</p>
          </div>
        )}
      </section>}

      <div className="map-workspace">
        <div className="map-map-pane">
          {mapMode === 'graph' ? (
            <CanvasGraphWorkspace
              projectId={projectId}
              projectTitle={projectTitle}
              onOpenStep={requestOpenStep}
            />
          ) : mapMode === 'flow' ? (
            <>
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
                const task = taskCounts[n.id]
                return (
                  <button
                    key={n.id}
                    type="button"
                    className={`map-node ${status} ${n.id === current ? 'current' : ''} ${n.id === selected ? 'selected' : ''} ${task?.running ? 'is-task-running' : ''} ${task?.failed ? 'has-task-failure' : ''}`}
                    style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
                    onClick={() => selectNode(n.id)}
                    data-map-node={n.id}
                    aria-label={`查看${n.label}节点${task?.running ? `，${task.running} 个任务运行中` : ''}${task?.failed ? `，${task.failed} 个失败` : ''}`}
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
                    {(task?.running || task?.failed) ? (
                      <span className="map-node-task">
                        {task.failed > 0 ? `${task.failed} 失败` : `${task.running} 运行中`}
                      </span>
                    ) : null}
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
            {listNodes.map((n) => {
              const status = statusOf(n)
              const task = taskCounts[n.id]
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`map-row ${status} ${n.id === selected ? 'selected' : ''} ${task?.running ? 'is-task-running' : ''} ${task?.failed ? 'has-task-failure' : ''}`}
                    onClick={() => selectNode(n.id)}
                    data-map-node={n.id}
                    aria-pressed={n.id === selected}
                  >
                    <em>{n.index !== null ? String(n.index).padStart(2, '0') : '—'}</em>
                    <b>{n.label}</b>
                    <span>{n.count > 0 ? `${n.count} ${n.unit}` : '未生成'}</span>
                    {(task?.running || task?.failed) ? (
                      <span className="map-row-task">
                        {task.failed > 0 ? `${task.failed} 失败` : `${task.running} 运行中`}
                      </span>
                    ) : null}
                    {n.issue ? <i>{issueLabel(n)}</i> : null}
                  </button>
                </li>
              )
            })}
          </ul>
            </>
          ) : (
            <ProductionMap
              episodes={previews.episodes?.items ?? []}
              scenes={previews.scenes?.items ?? []}
              shots={previews.shots?.items ?? []}
              assets={generationAssets}
              onOpenShot={(shotId) => requestClose(() => onOpenItem('shots', shotId))}
              onShowFlow={() => switchMapMode('flow')}
            />
          )}
        </div>

        {mapMode !== 'graph' && selectedNode && (
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
            {(selectedTask?.running || selectedTask?.failed) ? (
              <div className={`map-inspector-task ${selectedTask.failed ? 'has-failure' : ''}`}>
                <span>{selectedTask.failed ? `${selectedTask.failed} 个生成任务失败` : `${selectedTask.running} 个生成任务运行中`}</span>
                <small>{selectedTask.failed ? '定位到具体条目后，在任务中心重试。' : '完成前可以继续处理其他节点。'}</small>
              </div>
            ) : null}
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
            {preview && (preview.items.length > PREVIEW_FILTER_MIN || selectedNode.id === 'shots') && (
              <div className="canvas-preview-tools">
                {selectedNode.id === 'shots' && (
                  <div className="canvas-preview-scope">
                    <label>
                      <span>集</span>
                      <select
                        value={previewEpisode === null ? 'all' : String(previewEpisode)}
                        onChange={(event) => {
                          setPreviewEpisode(event.target.value === 'all' ? null : Number(event.target.value))
                          setPreviewScene(null)
                          setPreviewPage(0)
                        }}
                        aria-label="按集筛选画布镜头"
                      >
                        <option value="all">全部集</option>
                        {episodeOptions.map((episode) => (
                          <option key={episode} value={episode}>第 {episode} 集</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>场</span>
                      <select
                        value={previewScene ?? 'all'}
                        onChange={(event) => {
                          setPreviewScene(event.target.value === 'all' ? null : event.target.value)
                          setPreviewPage(0)
                        }}
                        aria-label="按场次筛选画布镜头"
                      >
                        <option value="all">全部场次</option>
                        {sceneOptions.map((scene) => (
                          <option key={scene} value={scene}>{scene}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
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
                      <span className="map-preview-actions">
                        <button
                          type="button"
                          className="map-preview-locate"
                          onClick={() => requestClose(() => onOpenItem(selectedNode.id, item.id))}
                          aria-label={`在工作台定位${item.title}`}
                        >
                          定位
                          <svg viewBox="0 0 20 20" aria-hidden="true">
                            <path d="m7.5 4.5 5 5-5 5" />
                          </svg>
                        </button>
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
                      </span>
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
                      setPreviewEpisode(null)
                      setPreviewScene(null)
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
              <button type="button" className="map-open-step" onClick={() => requestOpenStep(selectedNode.target)}>
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
