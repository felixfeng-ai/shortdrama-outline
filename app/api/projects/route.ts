// 项目：创建与列表。
import { NextResponse } from "next/server"
import { errorResponse, ok, InputError } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { createProject, listProjects } from "@/lib/assets/repo"

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
