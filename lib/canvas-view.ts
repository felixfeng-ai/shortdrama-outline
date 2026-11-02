// 画布详情的搜索、待补筛选与分页。
// 纯函数独立出来，长项目行为不依赖浏览器环境，也能直接做回归测试。

export interface CanvasSearchItem {
  title: string
  meta?: string
  note?: string
  missing?: boolean
  episode?: number
  scene?: string
}

export interface CanvasActionItem extends CanvasSearchItem {
  id: string
  targetId?: string
}

export type CanvasNodeKey = "visuals" | "places" | "shots" | string

export interface CanvasTaskInput {
  targetType: "character" | "place" | "shot"
  targetId: string
  status: "queued" | "running" | "succeeded" | "failed" | "canceled"
}

export interface CanvasTaskCount {
  running: number
  failed: number
}

export interface CanvasActionNode {
  id: CanvasNodeKey
  label: string
  issue: number
  items: readonly CanvasActionItem[]
}

export interface CanvasAction {
  key: string
  node: CanvasNodeKey
  itemId?: string
  title: string
  reason: string
  kind: "task-failed" | "item-missing" | "node-issue"
}

const TASK_NODE: Record<CanvasTaskInput["targetType"], CanvasNodeKey> = {
  character: "visuals",
  place: "places",
  shot: "shots",
}

export function summarizeCanvasTasks(
  tasks: readonly CanvasTaskInput[],
): Partial<Record<CanvasNodeKey, CanvasTaskCount>> {
  const summary: Partial<Record<CanvasNodeKey, CanvasTaskCount>> = {}
  for (const task of tasks) {
    if (task.status !== "queued" && task.status !== "running" && task.status !== "failed") continue
    const node = TASK_NODE[task.targetType]
    const count = summary[node] ?? { running: 0, failed: 0 }
    if (task.status === "failed") count.failed += 1
    else count.running += 1
    summary[node] = count
  }
  return summary
}

export function buildCanvasActionQueue(
  nodes: readonly CanvasActionNode[],
  tasks: readonly CanvasTaskInput[],
): CanvasAction[] {
  const failed: CanvasAction[] = []
  const missing: CanvasAction[] = []
  const nodeIssues: CanvasAction[] = []
  const taskKeys = new Set<string>()

  for (const task of tasks) {
    if (task.status !== "failed") continue
    const node = TASK_NODE[task.targetType]
    const nodeDef = nodes.find((item) => item.id === node)
    if (!nodeDef) continue
    const item = nodeDef.items.find((entry) =>
      entry.id === task.targetId || entry.targetId === task.targetId
    )
    const key = `${node}:${item?.id ?? task.targetId}`
    taskKeys.add(key)
    failed.push({
      key: `task:${key}`,
      node,
      itemId: item?.id ?? task.targetId,
      title: item?.title || `${nodeDef.label}生成任务`,
      reason: task.targetType === "character"
        ? "人物定妆生成失败"
        : task.targetType === "place"
          ? "地点场景图生成失败"
          : "镜头首帧生成失败",
      kind: "task-failed",
    })
  }

  for (const node of nodes) {
    const missingItems = node.items.filter((item) => item.missing)
    for (const item of missingItems) {
      const key = `${node.id}:${item.id}`
      if (taskKeys.has(key)) continue
      missing.push({
        key: `missing:${key}`,
        node: node.id,
        itemId: item.id,
        title: item.title,
        reason: item.meta || item.note || "内容待补",
        kind: "item-missing",
      })
    }
    if (node.issue > missingItems.length) {
      nodeIssues.push({
        key: `node:${node.id}`,
        node: node.id,
        title: node.label,
        reason: `还有 ${node.issue - missingItems.length} 项需要处理`,
        kind: "node-issue",
      })
    }
  }

  return [...failed, ...missing, ...nodeIssues]
}

export function filterCanvasItems<T extends CanvasSearchItem>(
  items: readonly T[],
  query: string,
  issuesOnly: boolean,
  scope: { episode?: number | null; scene?: string | null } = {},
): T[] {
  const needle = query.trim().toLocaleLowerCase()
  return items.filter((item) => {
    if (issuesOnly && !item.missing) return false
    if (scope.episode !== null && scope.episode !== undefined && item.episode !== scope.episode) return false
    if (scope.scene && item.scene !== scope.scene) return false
    if (!needle) return true
    return [item.title, item.meta, item.note]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
      .includes(needle)
  })
}

export function paginateCanvasItems<T>(
  items: readonly T[],
  requestedPage: number,
  pageSize: number,
): { items: T[]; page: number; pageCount: number; total: number } {
  const size = Math.max(1, Math.floor(pageSize))
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const page = Math.max(0, Math.min(pageCount - 1, Math.floor(requestedPage)))
  return {
    items: items.slice(page * size, page * size + size),
    page,
    pageCount,
    total,
  }
}
