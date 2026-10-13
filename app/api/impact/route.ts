// 影响范围：给定快照，返回所有（多层）依赖它的下游快照。
// 这是「改一处、全链联动」的查询入口。
import { NextResponse } from "next/server"
import { errorResponse, ok, InputError } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { findImpact } from "@/lib/assets/graph"

export const runtime = "nodejs"
// 这些路由依赖请求参数与数据库，不能静态预渲染
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const snapshotId = url.searchParams.get("snapshotId") || ""
    if (!snapshotId) throw new InputError("缺少 snapshotId")

    return NextResponse.json(ok({ affected: findImpact(getDbForRequest(), snapshotId) }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
