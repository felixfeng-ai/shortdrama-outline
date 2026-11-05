import type { CanvasGraph } from "./canvas-graph.ts"
import type { CanvasGraphRecord } from "./canvas-graph-repo.ts"

export class CanvasGraphSaveConflict extends Error {
  latest: CanvasGraphRecord | null

  constructor(message: string, latest: CanvasGraphRecord | null) {
    super(message)
    this.name = "CanvasGraphSaveConflict"
    this.latest = latest
  }
}

async function readPayload<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    if (response.status === 409) {
      throw new CanvasGraphSaveConflict(
        payload?.error || fallback,
        payload?.data?.latest ?? null,
      )
    }
    throw new Error(payload?.error || fallback)
  }
  return payload.data as T
}

export async function fetchCanvasGraph(
  projectId: string,
): Promise<CanvasGraphRecord | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/canvas-graph`,
    { cache: "no-store" },
  )
  return readPayload<CanvasGraphRecord | null>(response, "编排画布读取失败")
}

export async function persistCanvasGraph(
  projectId: string,
  graph: CanvasGraph,
  expectedRevision: number,
): Promise<CanvasGraphRecord> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/canvas-graph`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graph, expectedRevision }),
    },
  )
  return readPayload<CanvasGraphRecord>(response, "编排画布保存失败")
}
