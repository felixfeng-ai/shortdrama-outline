// 项目批量整理：只允许当前 owner 清理自己的项目。
import { NextResponse } from "next/server"

import { errorResponse, InputError, ok } from "@/lib/api"
import { deleteProject, listProjects } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { removeGeneratedProjectFiles } from "@/lib/generation/files"
import { SAMPLE_TITLE } from "@/lib/sample"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type BulkScope = "duplicate-samples" | "all"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const scope: BulkScope | null = body?.scope === "duplicate-samples"
      ? "duplicate-samples"
      : body?.scope === "all"
        ? "all"
        : null
    if (!scope) throw new InputError("请选择有效的项目清理方式")

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const projects = listProjects(db, ownerId)
    const samples = projects.filter((project) => project.title === SAMPLE_TITLE)
    // listProjects 已按更新时间倒序，重复清理只保留最近打开的一份示例。
    const keptProjectId = scope === "duplicate-samples" ? samples[0]?.id ?? null : null
    const targets = scope === "all"
      ? projects
      : samples.filter((project) => project.id !== keptProjectId)

    const deletedIds: string[] = []
    db.exec("BEGIN IMMEDIATE")
    try {
      for (const project of targets) {
        if (deleteProject(db, project.id, ownerId)) deletedIds.push(project.id)
      }
      db.exec("COMMIT")
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }

    for (const id of deletedIds) {
      try {
        removeGeneratedProjectFiles(id)
      } catch (error) {
        // 数据库已清理；生成目录失败只记录，不把成功删除误报成失败。
        console.error("[generation] 批量删除项目文件失败", id, error)
      }
    }

    return NextResponse.json(ok({
      scope,
      deletedCount: deletedIds.length,
      deletedIds,
      keptProjectId,
    }))
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}
