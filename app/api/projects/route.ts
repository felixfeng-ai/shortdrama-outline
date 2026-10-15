// 项目：创建与列表。
import { NextResponse } from "next/server"
import { errorResponse, ok, InputError } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { createProject, deleteProject, listProjects, renameProject } from "@/lib/assets/repo"

export const runtime = "nodejs"
// 这些路由依赖请求参数与数据库，不能静态预渲染
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const title = typeof body?.title === "string" ? body.title.trim() : ""
    if (!title) throw new InputError("请先给这个项目起个名字")
    if (title.length > 100) throw new InputError("项目名太长了，请控制在 100 字以内")

    const project = createProject(getDbForRequest(), title)
    return NextResponse.json(ok({ project }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}

export async function GET() {
  try {
    return NextResponse.json(ok({ projects: listProjects(getDbForRequest()) }))
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

    const project = renameProject(getDbForRequest(), id, title)
    if (!project) throw new InputError('没有这个项目，可能已经被删掉了')
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

    const removed = deleteProject(getDbForRequest(), id)
    if (!removed) throw new InputError('没有这个项目，可能已经删掉了')
    return NextResponse.json(ok({ id }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
