import type { StepKey } from "./types.ts"

export const CANVAS_GRAPH_NODE_TYPES = ["step", "note", "decision", "deliverable"] as const
export type CanvasGraphNodeType = (typeof CANVAS_GRAPH_NODE_TYPES)[number]

export type CanvasStepRef = StepKey | "places"

export interface CanvasGraphNode {
  id: string
  type: CanvasGraphNodeType
  title: string
  body: string
  x: number
  y: number
  system: boolean
  step?: CanvasStepRef
}

export interface CanvasGraphEdge {
  id: string
  from: string
  to: string
  label: string
}

export interface CanvasGraph {
  revision: number
  nodes: CanvasGraphNode[]
  edges: CanvasGraphEdge[]
  updatedAt: number
  updatedBy: string
}

export type CanvasGraphErrorCode =
  | "invalid-type"
  | "duplicate-node"
  | "dangling-edge"
  | "duplicate-edge"
  | "self-edge"
  | "system-node"
  | "invalid-node"
  | "invalid-graph"

export class CanvasGraphError extends Error {
  code: CanvasGraphErrorCode

  constructor(code: CanvasGraphErrorCode, message: string) {
    super(message)
    this.name = "CanvasGraphError"
    this.code = code
  }
}

const STEP_IDS: CanvasStepRef[] = [
  "characters",
  "acts",
  "episodes",
  "visuals",
  "scenes",
  "places",
  "shots",
]

const CUSTOM_TYPES = new Set<CanvasGraphNodeType>(["note", "decision", "deliverable"])

function customNodeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function customEdgeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `edge-${crypto.randomUUID()}`
  return `edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function touch(graph: CanvasGraph, nodes: CanvasGraphNode[], edges = graph.edges): CanvasGraph {
  return {
    ...graph,
    nodes,
    edges,
    updatedAt: Date.now(),
  }
}

function defaultTitle(type: CanvasGraphNodeType): string {
  if (type === "note") return "创作备注"
  if (type === "decision") return "判断节点"
  if (type === "deliverable") return "交付节点"
  return "制作步骤"
}

/**
 * 默认图只表达已有制作链与资产关系。
 * 它是项目编排的起点，不复制角色、镜头或正文快照。
 */
export function createDefaultCanvasGraph(): CanvasGraph {
  const nodes: CanvasGraphNode[] = [
    { id: "step-characters", type: "step", title: "核心人物", body: "人物动机、关系与弧光", x: 30, y: 90, system: true, step: "characters" },
    { id: "step-acts", type: "step", title: "三幕大纲", body: "全剧结构与阶段推进", x: 275, y: 90, system: true, step: "acts" },
    { id: "step-episodes", type: "step", title: "分集剧情", body: "每集冲突与结尾钩子", x: 520, y: 90, system: true, step: "episodes" },
    { id: "step-visuals", type: "step", title: "视觉定妆", body: "角色跨镜一致性锚点", x: 275, y: 320, system: true, step: "visuals" },
    { id: "step-scenes", type: "step", title: "场次剧本", body: "地点、时间与出场人物", x: 520, y: 320, system: true, step: "scenes" },
    { id: "step-places", type: "step", title: "地点锚点", body: "空间与光线跨场复用", x: 765, y: 320, system: true, step: "places" },
    { id: "step-shots", type: "step", title: "分镜", body: "动作、台词与生成参数", x: 950, y: 90, system: true, step: "shots" },
  ]
  const pairs: Array<[CanvasStepRef, CanvasStepRef, string]> = [
    ["characters", "acts", "人物驱动结构"],
    ["acts", "episodes", "结构拆集"],
    ["characters", "visuals", "人物转视觉"],
    ["episodes", "scenes", "分集拆场"],
    ["scenes", "places", "场次归并地点"],
    ["episodes", "shots", "分集落镜"],
    ["visuals", "shots", "锚点进镜头"],
    ["scenes", "shots", "场次拆镜"],
    ["places", "shots", "地点图进镜头"],
  ]
  return {
    revision: 0,
    nodes,
    edges: pairs.map(([from, to, label], index) => ({
      id: `default-edge-${index + 1}`,
      from: `step-${from}`,
      to: `step-${to}`,
      label,
    })),
    updatedAt: 0,
    updatedBy: "",
  }
}

/**
 * 服务端与客户端共用同一份结构校验。
 * 只要边是悬空的、id 重复或坐标不是有限数，就拒绝保存，而不是让坏图进入项目。
 */
export function validateCanvasGraph(value: unknown): CanvasGraph {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CanvasGraphError("invalid-graph", "画布内容格式不合法")
  }
  const input = value as Partial<CanvasGraph>
  if (!Array.isArray(input.nodes) || !Array.isArray(input.edges)) {
    throw new CanvasGraphError("invalid-graph", "画布缺少节点或连线")
  }
  if (input.nodes.length > 200 || input.edges.length > 400) {
    throw new CanvasGraphError("invalid-graph", "画布节点或连线数量过多")
  }
  if (!Number.isInteger(input.revision) || (input.revision ?? -1) < 0) {
    throw new CanvasGraphError("invalid-graph", "画布版本不合法")
  }

  const ids = new Set<string>()
  const nodes = input.nodes.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new CanvasGraphError("invalid-node", "画布节点格式不合法")
    }
    const node = candidate as CanvasGraphNode
    if (
      typeof node.id !== "string"
      || !node.id.trim()
      || typeof node.title !== "string"
      || !node.title.trim()
      || typeof node.body !== "string"
      || !CANVAS_GRAPH_NODE_TYPES.includes(node.type)
      || !Number.isFinite(node.x)
      || !Number.isFinite(node.y)
      || typeof node.system !== "boolean"
    ) {
      throw new CanvasGraphError("invalid-node", "画布节点字段不完整")
    }
    if (ids.has(node.id)) throw new CanvasGraphError("duplicate-node", "画布节点 id 重复")
    ids.add(node.id)
    if (node.title.length > 120 || node.body.length > 5_000) {
      throw new CanvasGraphError("invalid-node", "节点内容过长")
    }
    if (node.x < -2_000 || node.x > 4_000 || node.y < -2_000 || node.y > 4_000) {
      throw new CanvasGraphError("invalid-node", "节点坐标超出画布范围")
    }
    if (node.type === "step") {
      if (!node.system || !node.step || !STEP_IDS.includes(node.step)) {
        throw new CanvasGraphError("invalid-node", "系统步骤节点缺少步骤引用")
      }
    } else if (node.system) {
      throw new CanvasGraphError("invalid-node", "人工节点不能标记为系统节点")
    }
    return {
      id: node.id,
      type: node.type,
      title: node.title.trim(),
      body: node.body.trim(),
      x: node.x,
      y: node.y,
      system: node.system,
      ...(node.step ? { step: node.step } : {}),
    }
  })

  const edgeIds = new Set<string>()
  const edgePairs = new Set<string>()
  const edges = input.edges.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new CanvasGraphError("invalid-graph", "画布连线格式不合法")
    }
    const edge = candidate as CanvasGraphEdge
    if (
      typeof edge.id !== "string"
      || !edge.id.trim()
      || typeof edge.from !== "string"
      || typeof edge.to !== "string"
    ) {
      throw new CanvasGraphError("invalid-graph", "画布连线字段不完整")
    }
    if (edgeIds.has(edge.id)) throw new CanvasGraphError("invalid-graph", "画布连线 id 重复")
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      throw new CanvasGraphError("dangling-edge", "画布存在悬空连线")
    }
    if (edge.from === edge.to) throw new CanvasGraphError("self-edge", "节点不能连接自己")
    const pair = `${edge.from}:${edge.to}`
    if (edgePairs.has(pair)) throw new CanvasGraphError("duplicate-edge", "两个节点之间已有连线")
    edgeIds.add(edge.id)
    edgePairs.add(pair)
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      label: typeof edge.label === "string" ? edge.label.trim() : "",
    }
  })

  return {
    revision: input.revision!,
    nodes,
    edges,
    updatedAt: Number.isFinite(input.updatedAt) ? Number(input.updatedAt) : 0,
    updatedBy: typeof input.updatedBy === "string" ? input.updatedBy : "",
  }
}

export function addCanvasNode(
  graph: CanvasGraph,
  type: CanvasGraphNodeType,
  input: { id?: string; title?: string; body?: string; x?: number; y?: number } = {},
): CanvasGraph {
  if (!CUSTOM_TYPES.has(type)) {
    throw new CanvasGraphError("invalid-type", "系统步骤节点只能由默认图创建")
  }
  const id = input.id?.trim() || customNodeId()
  if (graph.nodes.some((node) => node.id === id)) {
    throw new CanvasGraphError("duplicate-node", "节点 id 已存在")
  }
  const offset = (graph.nodes.filter((node) => !node.system).length % 6) * 26
  const node: CanvasGraphNode = {
    id,
    type,
    title: input.title?.trim() || defaultTitle(type),
    body: input.body?.trim() || "",
    x: input.x ?? 760 + offset,
    y: input.y ?? 420 + offset,
    system: false,
  }
  return touch(graph, [...graph.nodes, node])
}

export function updateCanvasNode(
  graph: CanvasGraph,
  nodeId: string,
  patch: Partial<Pick<CanvasGraphNode, "title" | "body" | "x" | "y">>,
): CanvasGraph {
  if (!graph.nodes.some((node) => node.id === nodeId)) {
    throw new CanvasGraphError("invalid-node", "要修改的节点不存在")
  }
  return touch(graph, graph.nodes.map((node) =>
    node.id === nodeId ? { ...node, ...patch } : node
  ))
}

export function moveCanvasNode(
  graph: CanvasGraph,
  nodeId: string,
  x: number,
  y: number,
): CanvasGraph {
  return updateCanvasNode(graph, nodeId, { x, y })
}

export function connectCanvasNodes(
  graph: CanvasGraph,
  from: string,
  to: string,
): CanvasGraph {
  if (from === to) throw new CanvasGraphError("self-edge", "节点不能连接自己")
  const ids = new Set(graph.nodes.map((node) => node.id))
  if (!ids.has(from) || !ids.has(to)) {
    throw new CanvasGraphError("dangling-edge", "连线目标不存在")
  }
  if (graph.edges.some((edge) => edge.from === from && edge.to === to)) {
    throw new CanvasGraphError("duplicate-edge", "两个节点之间已有连线")
  }
  return touch(graph, graph.nodes, [
    ...graph.edges,
    { id: customEdgeId(), from, to, label: "" },
  ])
}

export function removeCanvasEdge(graph: CanvasGraph, edgeId: string): CanvasGraph {
  if (!graph.edges.some((edge) => edge.id === edgeId)) return graph
  return touch(
    graph,
    graph.nodes,
    graph.edges.filter((edge) => edge.id !== edgeId),
  )
}

export function removeCanvasNode(graph: CanvasGraph, nodeId: string): CanvasGraph {
  const node = graph.nodes.find((item) => item.id === nodeId)
  if (!node) throw new CanvasGraphError("invalid-node", "要删除的节点不存在")
  if (node.system) throw new CanvasGraphError("system-node", "系统步骤节点不能删除")
  return touch(
    graph,
    graph.nodes.filter((item) => item.id !== nodeId),
    graph.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId),
  )
}
