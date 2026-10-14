// 额度查询：给前端显示「今天还能生成几次」。
//
// 只读接口，不扣额度、不改任何状态——所以不经过 chargeQuota。
// 身份口径必须和生成路由完全一致（同一个 identityFromRequest），
// 否则会出现「这里显示还有额度，一生成却说超限」这种自相矛盾。
import { NextResponse } from "next/server"
import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { getQuota, identityFromRequest, FULL_PROJECT_COST, STEP_COST } from "@/lib/quota"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const snap = getQuota(getDbForRequest(), identityFromRequest(req))
    return NextResponse.json(ok({
      ...snap,
      // 附带口径，前端不用硬编码这些数字
      fullProjectCost: FULL_PROJECT_COST,
      stepCost: STEP_COST,
      // 还能跑几个完整项目（前端展示更直观）
      projectsLeft: Math.floor(snap.remaining / FULL_PROJECT_COST),
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
