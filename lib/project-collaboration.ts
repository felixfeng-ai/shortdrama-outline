import { randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "./api.ts"
import { getProject, getSnapshot } from "./assets/repo.ts"
import type { ArtifactKind } from "./assets/types.ts"

export type AgentMessageRole = "user" | "assistant" | "note"

export interface ProjectAgentMessage {
  id: string
  threadId: string
  role: AgentMessageRole
  content: string
  createdAt: number
}

export interface ProjectAgentThread {
  id: string
  projectId: string
  ownerId: string
  title: string
  messageCount: number
  createdAt: number
  updatedAt: number
  messages?: ProjectAgentMessage[]
}

export interface ProjectBranch {
  id: string
  projectId: string
  ownerId: string
  name: string
  baseSnapshotId: string
  baseKind: ArtifactKind
  baseVersion: number
  note: string
  createdAt: number
}

interface ThreadRow {
  id: string
  project_id: string
  owner_id: string
  title: string
  message_count?: number
  created_at: number
  updated_at: number
}

interface MessageRow {
  id: string
  thread_id: string
  role: string
  content: string
  created_at: number
}

interface BranchRow {
  id: string
  project_id: string
  owner_id: string
  name: string
  base_snapshot_id: string
  note: string
  created_at: number
  base_kind: string
  base_version: number
}

function text(value: unknown, max: number, preserveLines = false): string {
  if (typeof value !== "string") return ""
  return preserveLines
    ? value.trim().slice(0, max)
    : value.trim().replace(/\s+/g, " ").slice(0, max)
}

function requireProject(db: DatabaseSync, projectId: string, ownerId: string): void {
  if (!getProject(db, projectId, ownerId)) {
    const error = new Error("项目不存在或无权访问") as Error & { status: number }
    error.status = 403
    throw error
  }
}

function threadRow(row: ThreadRow): ProjectAgentThread {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    title: row.title,
    messageCount: Number(row.message_count ?? 0),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

function messageRow(row: MessageRow): ProjectAgentMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role as AgentMessageRole,
    content: row.content,
    createdAt: Number(row.created_at),
  }
}

function branchRow(row: BranchRow): ProjectBranch {
  return {
    id: row.id,
    projectId: row.project_id,
    ownerId: row.owner_id,
    name: row.name,
    baseSnapshotId: row.base_snapshot_id,
    baseKind: row.base_kind as ArtifactKind,
    baseVersion: Number(row.base_version),
    note: row.note,
    createdAt: Number(row.created_at),
  }
}

export function createAgentThread(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  input: { title?: unknown },
  now = Date.now(),
): ProjectAgentThread {
  requireProject(db, projectId, ownerId)
  const title = text(input.title, 120) || `项目会话 ${new Date(now).toLocaleDateString("zh-CN")}`
  const id = `thread_${randomUUID()}`
  db.prepare(
    `INSERT INTO project_agent_threads
      (id, project_id, owner_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, ownerId, title, now, now)
  return threadRow(db.prepare(
    "SELECT *, 0 AS message_count FROM project_agent_threads WHERE id = ?",
  ).get(id) as ThreadRow)
}

export function listAgentThreads(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
): ProjectAgentThread[] {
  requireProject(db, projectId, ownerId)
  return (db.prepare(
    `SELECT t.*, COUNT(m.id) AS message_count
     FROM project_agent_threads t
     LEFT JOIN project_agent_messages m ON m.thread_id = t.id
     WHERE t.project_id = ? AND t.owner_id = ?
     GROUP BY t.id
     ORDER BY t.updated_at DESC`,
  ).all(projectId, ownerId) as ThreadRow[]).map(threadRow)
}

export function getAgentThread(
  db: DatabaseSync,
  projectId: string,
  threadId: string,
  ownerId: string,
): ProjectAgentThread | null {
  const row = db.prepare(
    `SELECT * FROM project_agent_threads
     WHERE id = ? AND project_id = ? AND owner_id = ?`,
  ).get(threadId, projectId, ownerId) as ThreadRow | undefined
  if (!row) return null
  const messages = (db.prepare(
    `SELECT * FROM project_agent_messages
     WHERE thread_id = ?
     ORDER BY created_at ASC`,
  ).all(threadId) as MessageRow[]).map(messageRow)
  return { ...threadRow({ ...row, message_count: messages.length }), messages }
}

/**
 * 追加消息与线程更新时间在同一事务内完成；否则列表可能显示旧会话时间，
 * 用户会以为消息没有保存。越权线程在任何写入前就被拒绝。
 */
export function appendAgentThreadMessage(
  db: DatabaseSync,
  projectId: string,
  threadId: string,
  ownerId: string,
  input: { role?: unknown; content?: unknown },
  now = Date.now(),
): ProjectAgentMessage {
  const thread = getAgentThread(db, projectId, threadId, ownerId)
  if (!thread) {
    const error = new Error("会话不存在或无权访问") as Error & { status: number }
    error.status = 403
    throw error
  }
  const role = input.role === "assistant" || input.role === "note" ? input.role : "user"
  const content = text(input.content, 20_000, true)
  if (!content) throw new InputError("消息内容不能为空")
  const id = `message_${randomUUID()}`
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO project_agent_messages (id, thread_id, role, content, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, threadId, role, content, now)
    db.prepare(
      "UPDATE project_agent_threads SET updated_at = ? WHERE id = ?",
    ).run(now, threadId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return messageRow(db.prepare(
    "SELECT * FROM project_agent_messages WHERE id = ?",
  ).get(id) as MessageRow)
}

export function createProjectBranch(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
  input: { name?: unknown; baseSnapshotId?: unknown; note?: unknown },
  now = Date.now(),
): ProjectBranch {
  requireProject(db, projectId, ownerId)
  const name = text(input.name, 120)
  const baseSnapshotId = text(input.baseSnapshotId, 160)
  if (!name) throw new InputError("分支名称不能为空")
  const snapshot = getSnapshot(db, baseSnapshotId)
  if (!snapshot || snapshot.projectId !== projectId) throw new InputError("分支基线快照不存在")
  const id = `branch_${randomUUID()}`
  db.prepare(
    `INSERT INTO project_branches
      (id, project_id, owner_id, name, base_snapshot_id, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, projectId, ownerId, name, baseSnapshotId, text(input.note, 1_000, true), now)
  return branchRow(db.prepare(
    `SELECT b.*, s.kind AS base_kind, s.version AS base_version
     FROM project_branches b
     JOIN snapshots s ON s.id = b.base_snapshot_id
     WHERE b.id = ?`,
  ).get(id) as BranchRow)
}

export function listProjectBranches(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
): ProjectBranch[] {
  requireProject(db, projectId, ownerId)
  return (db.prepare(
    `SELECT b.*, s.kind AS base_kind, s.version AS base_version
     FROM project_branches b
     JOIN snapshots s ON s.id = b.base_snapshot_id
     WHERE b.project_id = ? AND b.owner_id = ?
     ORDER BY b.created_at DESC`,
  ).all(projectId, ownerId) as BranchRow[]).map(branchRow)
}
