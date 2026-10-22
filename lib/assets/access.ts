import type { DatabaseSync } from "node:sqlite"
import { getProject, type Project } from "./repo.ts"

/**
 * 项目访问的唯一入口。
 *
 * 用 403 而不是区分“项目不存在”和“无权限”，避免项目 id 被枚举；
 * 所有项目读写接口都必须在做事之前调用它。
 */
export function assertProjectAccess(
  db: DatabaseSync,
  projectId: string,
  ownerId: string,
): Project {
  const project = getProject(db, projectId, ownerId)
  if (project) return project
  const error = new Error("项目不存在或无权访问") as Error & { status: number }
  error.status = 403
  throw error
}
