// 项目：创建与列表。
import { NextResponse } from "next/server"
import { errorResponse, ok, InputError } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { claimLegacyProjects, createProject, deleteProject, listProjects, renameProject } from "@/lib/assets/repo"
import { resolveProjectOwner } from "@/lib/auth/request"
import { assertProjectAccess } from "@/lib/assets/access"
import { removeGeneratedProjectFiles } from "@/lib/generation/files"

export const runtime = "nodejs"
// 这些路由依赖请求参数与数据库，不能静态预渲染
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const title = typeof body?.title === "string" ? body.title.trim() : ""
    if (!title) throw new InputError("请先给这个项目起个名字")
    if (title.length > 100) throw new InputError("项目名太长了，请控制在 100 字以内")

    const db = getDbForRequest()
    const project = createProject(db, title, resolveProjectOwner(db, req))
    return NextResponse.json(ok({ project }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const url = new URL(req.url)
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1"
    if (local || process.env.CHENGJU_CLAIM_LEGACY_PROJECTS === "1") {
      claimLegacyProjects(db, ownerId)
    }
    return NextResponse.json(ok({ projects: listProjects(db, ownerId) }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

/** 重命名：只改项目的显示名，不动任何快照内容 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const id = typeof body?.id === 'string' ? body.id.trim() : ''
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    if (!id) throw new InputError('缺少项目 id')
    if (!title) throw new InputError('项目名不能为空')
    if (title.length > 100) throw new InputError('项目名太长了，请控制在 100 字以内')

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    const project = renameProject(db, id, title, ownerId)
    if (!project) throw new InputError('项目名没有更新，请重试')
    return NextResponse.json(ok({ project }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

/**
 * 删除项目：连带快照、血缘、图台账（表上都是 ON DELETE CASCADE）。
 * 刻意不做成「软删除」——用户删项目就是要这东西消失，库里留着残骸反而更难解释。
 */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')?.trim() || ''
    if (!id) throw new InputError('缺少项目 id')

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    assertProjectAccess(db, id, ownerId)
    const removed = deleteProject(db, id, ownerId)
    if (!removed) throw new InputError('项目没有删除，请重试')
    try {
      removeGeneratedProjectFiles(id)
    } catch (error) {
      // 数据库已级联清理；文件清理失败只记日志，避免把成功删除误报成失败。
      console.error("[generation] 项目关键帧目录清理失败", error)
    }
    return NextResponse.json(ok({ id }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
