"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react"

import {
  addCanvasNode,
  CanvasGraphError,
  connectCanvasNodes,
  createDefaultCanvasGraph,
  moveCanvasNode,
  removeCanvasEdge,
  removeCanvasNode,
  updateCanvasNode,
  validateCanvasGraph,
  type CanvasGraph,
  type CanvasGraphNode,
  type CanvasGraphNodeType,
  type CanvasStepRef,
} from "@/lib/canvas-graph"
import {
  CanvasGraphSaveConflict,
  fetchCanvasGraph,
  persistCanvasGraph,
} from "@/lib/canvas-graph-client"
import type { CanvasGraphRecord } from "@/lib/canvas-graph-repo"
import type { StepKey } from "@/lib/types"

interface Props {
  projectId: string | null
  projectTitle: string
  onOpenStep: (step: StepKey) => void
}

type SaveState = "loading" | "local" | "saved" | "dirty" | "saving" | "conflict" | "error" | "remote"

const BOARD_W = 1200
const BOARD_H = 560
const NODE_W = 188
const NODE_H = 100
const MIN_ZOOM = 0.35
const MAX_ZOOM = 1.8
const PRESENCE_WINDOW = 18_000

const NODE_TYPE_LABEL: Record<CanvasGraphNodeType, string> = {
  step: "制作步骤",
  note: "备注",
  decision: "判断",
  deliverable: "交付物",
}

function newClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function newNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function stepKeyOf(step: CanvasStepRef | undefined): StepKey {
  return step === "places" ? "scenes" : (step ?? "characters")
}

function statusLabel(state: SaveState, lastSavedAt: number): string {
  if (state === "loading") return "读取中"
  if (state === "saving") return "保存中"
  if (state === "dirty") return "未保存"
  if (state === "conflict") return "版本冲突"
  if (state === "error") return "保存失败"
  if (state === "remote") return "已同步其他标签页"
  if (state === "local") return "需先保存项目"
  if (!lastSavedAt) return "已保存"
  return `已保存 ${new Date(lastSavedAt).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}`
}

export default function CanvasGraphWorkspace({
  projectId,
  projectTitle,
  onOpenStep,
}: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)
  const graphRef = useRef<CanvasGraph>(createDefaultCanvasGraph())
  const saveStateRef = useRef<SaveState>("loading")
  const revisionRef = useRef(0)
  const editGenerationRef = useRef(0)
  const clientIdRef = useRef("")
  const peersRef = useRef(new Map<string, number>())
  const dragNodeRef = useRef<{
    id: string
    pointerId: number
    startX: number
    startY: number
    nodeX: number
    nodeY: number
    moved: boolean
  } | null>(null)
  const panDragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)
  const [graph, setGraph] = useState<CanvasGraph>(() => createDefaultCanvasGraph())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("loading")
  const [lastSavedAt, setLastSavedAt] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<CanvasGraphRecord | null>(null)
  const [peerCount, setPeerCount] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  saveStateRef.current = saveState

  const selectedNode = graph.nodes.find((node) => node.id === selectedId) ?? null
  const nodeMap = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  )
  const selectedEdges = selectedNode
    ? graph.edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id)
    : []

  function setGraphState(next: CanvasGraph) {
    graphRef.current = next
    setGraph(next)
  }

  function broadcast(message: Record<string, unknown>) {
    channelRef.current?.postMessage({
      ...message,
      sourceId: clientIdRef.current,
      at: Date.now(),
    })
  }

  function markChanged(next: CanvasGraph, options: { broadcast?: boolean } = {}) {
    editGenerationRef.current += 1
    setGraphState(next)
    setSaveState("dirty")
    setError(null)
    if (options.broadcast !== false) {
      broadcast({ type: "draft", graph: next })
    }
  }

  async function loadGraph() {
    if (!projectId) {
      setGraphState(createDefaultCanvasGraph())
      revisionRef.current = 0
      setSaveState("local")
      setError(null)
      return
    }
    setSaveState("loading")
    setError(null)
    setConflict(null)
    try {
      const record = await fetchCanvasGraph(projectId)
      const next = record?.graph ?? createDefaultCanvasGraph()
      setGraphState(next)
      revisionRef.current = record?.revision ?? 0
      setLastSavedAt(record?.updatedAt ?? 0)
      setSaveState("saved")
    } catch (loadError) {
      setSaveState("error")
      setError(loadError instanceof Error ? loadError.message : "编排画布读取失败")
    }
  }

  async function saveNow(force = false) {
    if (!projectId || saveState === "saving") return
    if (!force && (saveState === "conflict" || saveState === "error")) return
    const snapshot = graphRef.current
    const generation = editGenerationRef.current
    setSaveState("saving")
    setError(null)
    try {
      const record = await persistCanvasGraph(projectId, snapshot, revisionRef.current)
      revisionRef.current = record.revision
      setLastSavedAt(record.updatedAt)
      setConflict(null)
      broadcast({ type: "saved", graph: record.graph, revision: record.revision })
      if (editGenerationRef.current === generation) {
        setGraphState(record.graph)
        setSaveState("saved")
      } else {
        const current = graphRef.current
        setGraphState({
          ...current,
          revision: record.revision,
          updatedAt: record.updatedAt,
          updatedBy: record.updatedBy,
        })
        setSaveState("dirty")
      }
    } catch (saveError) {
      if (saveError instanceof CanvasGraphSaveConflict) {
        setConflict(saveError.latest)
        setSaveState("conflict")
        setError(saveError.message)
      } else {
        setSaveState("error")
        setError(saveError instanceof Error ? saveError.message : "编排画布保存失败")
      }
    }
  }

  function loadLatest() {
    if (!conflict) {
      void loadGraph()
      return
    }
    setGraphState(conflict.graph)
    revisionRef.current = conflict.revision
    setLastSavedAt(conflict.updatedAt)
    setConflict(null)
    setSaveState("saved")
    setError(null)
  }

  useEffect(() => {
    clientIdRef.current = newClientId()
    void loadGraph()
    // 项目切换时只加载当前项目画布。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (!projectId || typeof BroadcastChannel === "undefined" || !clientIdRef.current) {
      setPeerCount(1)
      return
    }
    const channel = new BroadcastChannel(`chengju:canvas:${projectId}`)
    channelRef.current = channel
    const presence = () => channel.postMessage({
      type: "presence",
      sourceId: clientIdRef.current,
      at: Date.now(),
    })
    channel.onmessage = (event: MessageEvent) => {
      const message = event.data as {
        type?: string
        sourceId?: string
        graph?: unknown
        revision?: number
        at?: number
      }
      if (!message?.sourceId || message.sourceId === clientIdRef.current) return
      if (message.type === "presence") {
        peersRef.current.set(message.sourceId, message.at ?? Date.now())
        setPeerCount(Math.max(1, peersRef.current.size + 1))
        return
      }
      if (!message.graph) return
      try {
        const remote = validateCanvasGraph(message.graph)
        if (message.type === "saved" && remote.revision >= revisionRef.current) {
          revisionRef.current = remote.revision
          setGraphState(remote)
          setSaveState("remote")
          setLastSavedAt(remote.updatedAt)
          return
        }
        if (
          message.type === "draft"
          && remote.revision === revisionRef.current
          && !["dirty", "saving"].includes(saveStateRef.current)
        ) {
          setGraphState(remote)
          setSaveState("remote")
        }
      } catch {
        // 坏消息不覆盖当前画布。
      }
    }
    presence()
    const ping = window.setInterval(presence, 6_000)
    const cleanupPresence = window.setInterval(() => {
      const cutoff = Date.now() - PRESENCE_WINDOW
      for (const [id, at] of peersRef.current) {
        if (at < cutoff) peersRef.current.delete(id)
      }
      setPeerCount(Math.max(1, peersRef.current.size + 1))
    }, 6_000)
    return () => {
      channel.postMessage({ type: "leave", sourceId: clientIdRef.current, at: Date.now() })
      channel.close()
      channelRef.current = null
      window.clearInterval(ping)
      window.clearInterval(cleanupPresence)
      peersRef.current.clear()
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || !["dirty"].includes(saveState)) return
    const timer = window.setTimeout(() => { void saveNow() }, 650)
    return () => window.clearTimeout(timer)
    // graph 变化会重置自动保存窗口。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, projectId, saveState])

  useEffect(() => {
    if (selectedId && !graph.nodes.some((node) => node.id === selectedId)) {
      setSelectedId(null)
      setConnectFrom(null)
    }
  }, [graph.nodes, selectedId])

  useEffect(() => {
    const refit = () => {
      const element = viewportRef.current
      if (!element) return
      if (window.matchMedia("(max-width: 760px)").matches) {
        setZoom(0.8)
        setPan({ x: 16, y: 92 })
        return
      }
      const pad = 44
      const next = Math.max(
        MIN_ZOOM,
        Math.min(
          MAX_ZOOM,
          (element.clientWidth - pad) / BOARD_W,
          (element.clientHeight - pad) / BOARD_H,
          1,
        ),
      )
      setZoom(next)
      setPan({
        x: Math.max(0, (element.clientWidth - BOARD_W * next) / 2),
        y: Math.max(0, (element.clientHeight - BOARD_H * next) / 2),
      })
    }
    refit()
    const observer = new ResizeObserver(refit)
    if (viewportRef.current) observer.observe(viewportRef.current)
    return () => observer.disconnect()
  }, [])

  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    const element = viewportRef.current
    if (!element) return
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * factor))
    if (next === zoom) return
    const rect = element.getBoundingClientRect()
    const x = clientX === undefined ? element.clientWidth / 2 : clientX - rect.left
    const y = clientY === undefined ? element.clientHeight / 2 : clientY - rect.top
    const ratio = next / zoom
    setPan({
      x: x - (x - pan.x) * ratio,
      y: y - (y - pan.y) * ratio,
    })
    setZoom(next)
  }

  function fitGraph() {
    const element = viewportRef.current
    if (!element) return
    const pad = 44
    const next = Math.max(
      MIN_ZOOM,
      Math.min(
        MAX_ZOOM,
        (element.clientWidth - pad) / BOARD_W,
        (element.clientHeight - pad) / BOARD_H,
        1,
      ),
    )
    setZoom(next)
    setPan({
      x: Math.max(0, (element.clientWidth - BOARD_W * next) / 2),
      y: Math.max(0, (element.clientHeight - BOARD_H * next) / 2),
    })
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".canvas-graph-node, button, input, textarea, select")) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    panDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
    setDragging(true)
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = panDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY,
    })
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (panDragRef.current?.pointerId !== event.pointerId) return
    panDragRef.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function startNodeDrag(event: ReactPointerEvent<HTMLElement>, node: CanvasGraphNode) {
    if (event.button !== 0) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragNodeRef.current = {
      id: node.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x,
      nodeY: node.y,
      moved: false,
    }
    setSelectedId(node.id)
    setDraggingNodeId(node.id)
  }

  function moveNode(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragNodeRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = (event.clientX - drag.startX) / zoom
    const dy = (event.clientY - drag.startY) / zoom
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true
    const next = moveCanvasNode(
      graphRef.current,
      drag.id,
      Math.max(-100, Math.min(BOARD_W - NODE_W + 100, drag.nodeX + dx)),
      Math.max(-100, Math.min(BOARD_H - NODE_H + 100, drag.nodeY + dy)),
    )
    setGraphState(next)
    setSaveState("dirty")
    setError(null)
  }

  function endNodeDrag(event: ReactPointerEvent<HTMLElement>, node: CanvasGraphNode) {
    const drag = dragNodeRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragNodeRef.current = null
    setDraggingNodeId(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (drag.moved) {
      editGenerationRef.current += 1
      broadcast({ type: "draft", graph: graphRef.current })
    } else {
      activateNode(node)
    }
  }

  function activateNode(node: CanvasGraphNode) {
    if (connectFrom) {
      if (connectFrom === node.id) {
        setError("不能把节点连接到自己")
        return
      }
      try {
        markChanged(connectCanvasNodes(graphRef.current, connectFrom, node.id))
        setSelectedId(node.id)
        setConnectFrom(null)
      } catch (connectError) {
        setError(connectError instanceof CanvasGraphError ? connectError.message : "节点连接失败")
      }
      return
    }
    setSelectedId(node.id)
  }

  function handleNodeKey(event: ReactKeyboardEvent<HTMLElement>, node: CanvasGraphNode) {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    activateNode(node)
  }

  function addNode(type: CanvasGraphNodeType) {
    try {
      const id = newNodeId()
      const next = addCanvasNode(graphRef.current, type, { id })
      markChanged(next)
      setSelectedId(id)
    } catch (addError) {
      setError(addError instanceof CanvasGraphError ? addError.message : "节点新增失败")
    }
  }

  function deleteSelectedNode() {
    if (!selectedNode) return
    try {
      const next = removeCanvasNode(graphRef.current, selectedNode.id)
      markChanged(next)
      setSelectedId(null)
      setConnectFrom(null)
    } catch (removeError) {
      setError(removeError instanceof CanvasGraphError ? removeError.message : "节点删除失败")
    }
  }

  function removeEdge(edgeId: string) {
    markChanged(removeCanvasEdge(graphRef.current, edgeId))
  }

  function updateSelected(patch: Partial<Pick<CanvasGraphNode, "title" | "body">>) {
    if (!selectedNode || selectedNode.system) return
    markChanged(updateCanvasNode(graphRef.current, selectedNode.id, patch))
  }

  function edgeGeometry(edgeId: string, fromId: string, toId: string) {
    const from = nodeMap.get(fromId)
    const to = nodeMap.get(toId)
    if (!from || !to) return null
    const x1 = from.x + NODE_W / 2
    const y1 = from.y + NODE_H / 2
    const x2 = to.x + NODE_W / 2
    const y2 = to.y + NODE_H / 2
    const curve = Math.max(48, Math.abs(x2 - x1) * 0.46)
    return {
      id: edgeId,
      path: `M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`,
    }
  }

  if (!projectId) {
    return (
      <div className="canvas-graph-empty">
        <strong>编排画布需要项目身份</strong>
        <p>先保存当前项目，再添加人工判断、备注与交付节点。</p>
      </div>
    )
  }

  return (
    <div className="canvas-graph-workspace">
      <div className="canvas-graph-main">
        <header className="canvas-graph-head">
          <div>
            <span>ORCHESTRATION CANVAS</span>
            <strong>{projectTitle || "当前项目"} · 编排画布</strong>
            <small>{graph.nodes.length} 节点 · {graph.edges.length} 条依赖</small>
          </div>
          <div className="canvas-graph-status">
            <span className={`canvas-graph-save ${saveState}`}>
              <i aria-hidden="true" />
              {statusLabel(saveState, lastSavedAt)}
            </span>
            <span className="canvas-graph-peers" title="同一浏览器内打开当前项目的标签页">
              实时同步 · {peerCount} 个标签页
            </span>
            {(saveState === "conflict" || saveState === "error") && (
              <button
                type="button"
                onClick={saveState === "conflict" ? loadLatest : () => { void saveNow(true) }}
              >
                {saveState === "conflict" ? "载入最新" : "重试保存"}
              </button>
            )}
          </div>
        </header>

        <div className="canvas-graph-toolbar">
          <div className="canvas-graph-palette" role="group" aria-label="新增编排节点">
            <span>添加</span>
            <button type="button" onClick={() => addNode("note")}>备注</button>
            <button type="button" onClick={() => addNode("decision")}>判断</button>
            <button type="button" onClick={() => addNode("deliverable")}>交付物</button>
          </div>
          <div className="canvas-graph-controls" role="group" aria-label="编排画布缩放">
            <button type="button" onClick={() => zoomAt(0.86)} aria-label="缩小编排画布">−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => zoomAt(1.16)} aria-label="放大编排画布">+</button>
            <button type="button" onClick={fitGraph}>适应</button>
          </div>
        </div>

        {connectFrom && (
          <div className="canvas-graph-connect-banner" role="status">
            已从「{nodeMap.get(connectFrom)?.title}」发起连接，选择目标节点
            <button type="button" onClick={() => setConnectFrom(null)}>取消</button>
          </div>
        )}

        {error && <p className="canvas-graph-error" role="alert">{error}</p>}

        <div
          ref={viewportRef}
          className={`canvas-graph-viewport ${dragging ? "is-panning" : ""}`}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          onWheel={(event) => {
            event.preventDefault()
            zoomAt(event.deltaY > 0 ? 0.92 : 1.08, event.clientX, event.clientY)
          }}
          role="region"
          aria-label="实时编排画布"
          tabIndex={0}
        >
          <div
            className="canvas-graph-board"
            style={{
              width: BOARD_W,
              height: BOARD_H,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            }}
          >
            <svg
              className="canvas-graph-edges"
              viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
              aria-hidden="true"
            >
              <defs>
                <marker id="canvas-graph-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {graph.edges.map((edge) => {
                const geometry = edgeGeometry(edge.id, edge.from, edge.to)
                if (!geometry) return null
                return (
                  <path
                    key={geometry.id}
                    d={geometry.path}
                    markerEnd="url(#canvas-graph-arrow)"
                  />
                )
              })}
            </svg>

            {graph.nodes.map((node) => (
              <article
                key={node.id}
                className={[
                  "canvas-graph-node",
                  node.type,
                  selectedId === node.id ? "selected" : "",
                  connectFrom === node.id ? "connect-source" : "",
                  draggingNodeId === node.id ? "dragging" : "",
                ].filter(Boolean).join(" ")}
                style={{ left: node.x, top: node.y, width: NODE_W, height: NODE_H }}
                role="button"
                tabIndex={0}
                aria-pressed={selectedId === node.id}
                onPointerDown={(event) => startNodeDrag(event, node)}
                onPointerMove={moveNode}
                onPointerUp={(event) => endNodeDrag(event, node)}
                onKeyDown={(event) => handleNodeKey(event, node)}
              >
                <span className="canvas-graph-node-kind">
                  {NODE_TYPE_LABEL[node.type]}
                  {node.system && <i>SYSTEM</i>}
                </span>
                <strong>{node.title}</strong>
                <p>{node.body || "尚未填写说明"}</p>
                <span className="canvas-graph-node-meta">
                  {graph.edges.filter((edge) => edge.from === node.id).length} 出
                  {" · "}
                  {graph.edges.filter((edge) => edge.to === node.id).length} 入
                </span>
              </article>
            ))}
          </div>
        </div>
      </div>

      <aside className="canvas-graph-inspector" aria-label="编排节点属性">
        {!selectedNode ? (
          <div className="canvas-graph-inspector-empty">
            <span>NODE INSPECTOR</span>
            <strong>选择一个节点</strong>
            <p>拖动调整布局，或从节点发起依赖连线。</p>
          </div>
        ) : (
          <>
            <header>
              <span>{selectedNode.system ? "SYSTEM NODE" : "CUSTOM NODE"}</span>
              <strong>{NODE_TYPE_LABEL[selectedNode.type]}</strong>
            </header>
            {selectedNode.system ? (
              <div className="canvas-graph-readonly">
                <h3>{selectedNode.title}</h3>
                <p>{selectedNode.body}</p>
              </div>
            ) : (
              <div className="canvas-graph-fields">
                <label>
                  <span>标题</span>
                  <input
                    value={selectedNode.title}
                    maxLength={120}
                    onChange={(event) => updateSelected({ title: event.target.value })}
                  />
                </label>
                <label>
                  <span>内容</span>
                  <textarea
                    value={selectedNode.body}
                    maxLength={5_000}
                    rows={5}
                    onChange={(event) => updateSelected({ body: event.target.value })}
                  />
                </label>
              </div>
            )}

            <div className="canvas-graph-inspector-actions">
              {selectedNode.system && (
                <button type="button" className="primary" onClick={() => onOpenStep(stepKeyOf(selectedNode.step))}>
                  打开对应步骤
                </button>
              )}
              <button
                type="button"
                onClick={() => setConnectFrom(connectFrom === selectedNode.id ? null : selectedNode.id)}
              >
                {connectFrom === selectedNode.id ? "取消连接" : "连接节点"}
              </button>
              {!selectedNode.system && (
                <button type="button" className="danger" onClick={deleteSelectedNode}>
                  删除节点
                </button>
              )}
            </div>

            <section className="canvas-graph-links">
              <header>
                <span>依赖关系</span>
                <b>{selectedEdges.length}</b>
              </header>
              {selectedEdges.length === 0 ? (
                <p>这个节点还没有上下游连接。</p>
              ) : (
                <ul>
                  {selectedEdges.map((edge) => {
                    const from = nodeMap.get(edge.from)
                    const to = nodeMap.get(edge.to)
                    return (
                      <li key={edge.id}>
                        <span>{from?.title ?? edge.from} → {to?.title ?? edge.to}</span>
                        <button type="button" onClick={() => removeEdge(edge.id)} aria-label="删除这条连线">
                          ×
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  )
}
