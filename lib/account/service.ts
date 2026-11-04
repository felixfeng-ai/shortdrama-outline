import type { DatabaseSync } from "node:sqlite"

import { listProjects, listSnapshots } from "../assets/repo.ts"
import { ARTIFACT_KINDS } from "../assets/types.ts"
import {
  listGeneratedAssets,
  listGenerationTasks,
} from "../generation/repo.ts"
import { removeGeneratedProjectFiles } from "../generation/files.ts"

export interface AccountExport {
  version: 1
  exportedAt: number
  user: {
    id: string
    email: string | null
    phone: string | null
    displayName: string
    createdAt: number
  }
  projects: Array<{
    id: string
    title: string
    createdAt: number
    updatedAt: number
    snapshots: Array<{
      id: string
      kind: string
      version: number
      payload: unknown
      parents: string[]
      createdAt: number
    }>
    tasks: unknown[]
    assets: Array<{
      id: string
      taskId: string
      targetType: string
      targetId: string
      storageKey: string
      mime: string
      bytes: number
      providerId: string
      model: string
      prompt: string
      selectedAt: number | null
      createdAt: number
    }>
  }>
  warnings: string[]
}

function userRow(db: DatabaseSync, userId: string): AccountExport["user"] | null {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    id: String(row.id),
    email: typeof row.email === "string" ? row.email : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    displayName: String(row.display_name),
    createdAt: Number(row.created_at),
  }
}

export function buildAccountExport(
  db: DatabaseSync,
  userId: string,
  now = Date.now(),
): AccountExport {
  const user = userRow(db, userId)
  if (!user) throw new Error("账号不存在")
  const projects = listProjects(db, userId).map((project) => ({
    id: project.id,
    title: project.title,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    snapshots: ARTIFACT_KINDS.flatMap((kind) =>
      listSnapshots(db, project.id, kind).map((snapshot) => ({
        id: snapshot.id,
        kind: snapshot.kind,
        version: snapshot.version,
        payload: snapshot.payload,
        parents: snapshot.parents,
        createdAt: snapshot.createdAt,
      })),
    ),
    tasks: listGenerationTasks(db, project.id),
    assets: listGeneratedAssets(db, project.id).map((asset) => ({
      id: asset.id,
      taskId: asset.taskId,
      targetType: asset.targetType,
      targetId: asset.targetId,
      storageKey: asset.storageKey,
      mime: asset.mime,
      bytes: asset.bytes,
      providerId: asset.providerId,
      model: asset.model,
      prompt: asset.prompt,
      selectedAt: asset.selectedAt,
      createdAt: asset.createdAt,
    })),
  }))
  return {
    version: 1,
    exportedAt: now,
    user,
    projects,
    warnings: ["生成图片本体不包含在 JSON 导出中；请在审片页分别下载需要保留的图片。"],
  }
}

export function deleteAccountData(
  db: DatabaseSync,
  userId: string,
): { deleted: boolean; projects: number } {
  const user = userRow(db, userId)
  if (!user) return { deleted: false, projects: 0 }
  const projects = listProjects(db, userId)
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare("DELETE FROM project_skill_bindings WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)").run(userId)
    db.prepare("DELETE FROM projects WHERE owner_id = ?").run(userId)
    db.prepare("DELETE FROM personal_skills WHERE owner_id = ?").run(userId)
    db.prepare("DELETE FROM reusable_assets WHERE owner_id = ?").run(userId)
    db.prepare("DELETE FROM push_subscriptions WHERE owner_id = ?").run(userId)
    db.prepare("DELETE FROM mobile_push_tokens WHERE owner_id = ?").run(userId)
    db.prepare("DELETE FROM billing_transactions WHERE owner_id = ?").run(userId)
    if (user.email) {
      db.prepare("DELETE FROM email_login_codes WHERE email = ?").run(user.email)
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(userId)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  for (const project of projects) {
    try {
      removeGeneratedProjectFiles(project.id)
    } catch {
      // Database deletion is authoritative; missing files should not block account closure.
    }
  }
  return { deleted: true, projects: projects.length }
}
