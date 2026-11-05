import type { DatabaseSync } from "node:sqlite"

import {
  CanvasGraphError,
  validateCanvasGraph,
  type CanvasGraph,
} from "./canvas-graph.ts"

export interface CanvasGraphRecord {
  graph: CanvasGraph
  revision: number
  updatedBy: string
  updatedAt: number
}

interface CanvasGraphRow {
  project_id: string
  revision: number
  graph_json: string
  updated_by: string
  updated_at: number
}

export class CanvasGraphConflictError extends Error {
  latest: CanvasGraphRecord

  constructor(latest: CanvasGraphRecord) {
    super("画布已在其他页面更新，请重新读取最新版本")
    this.name = "CanvasGraphConflictError"
    this.latest = latest
  }
}

function toRecord(row: CanvasGraphRow): CanvasGraphRecord {
  const graph = validateCanvasGraph(JSON.parse(row.graph_json))
  return {
    graph: {
      ...graph,
      revision: row.revision,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    },
    revision: row.revision,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  }
}

export function loadCanvasGraph(
  db: DatabaseSync,
  projectId: string,
): CanvasGraphRecord | null {
  const row = db.prepare(
    "SELECT * FROM canvas_graphs WHERE project_id = ?",
  ).get(projectId) as CanvasGraphRow | undefined
  return row ? toRecord(row) : null
}

export function saveCanvasGraph(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  input: unknown,
  expectedRevision: number,
): CanvasGraphRecord {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    throw new CanvasGraphError("invalid-graph", "expectedRevision 不合法")
  }
  const validated = validateCanvasGraph(input)
  const current = loadCanvasGraph(db, projectId)
  const currentRevision = current?.revision ?? 0
  if (currentRevision !== expectedRevision) {
    if (!current) throw new CanvasGraphConflictError({
      graph: { ...validated, revision: 0 },
      revision: 0,
      updatedBy: "",
      updatedAt: 0,
    })
    throw new CanvasGraphConflictError(current)
  }

  const now = Date.now()
  const revision = currentRevision + 1
  const graph: CanvasGraph = {
    ...validated,
    revision,
    updatedBy: ownerId,
    updatedAt: now,
  }
  db.prepare(`
    INSERT INTO canvas_graphs (project_id, revision, graph_json, updated_by, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id) DO UPDATE SET
      revision = excluded.revision,
      graph_json = excluded.graph_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `).run(projectId, revision, JSON.stringify(graph), ownerId, now)
  return {
    graph,
    revision,
    updatedBy: ownerId,
    updatedAt: now,
  }
}
