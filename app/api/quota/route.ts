// 额度查询：给前端显示「今天还能生成几次」。
//
// 只读接口，不扣额度、不改任何状态——所以不经过 chargeQuota。
// 身份口径必须和生成路由完全一致（同一个 identityFromRequest），
// 否则会出现「这里显示还有额度，一生成却说超限」这种自相矛盾。
import { NextResponse } from "next/server"
import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { getQuota, FULL_PROJECT_COST, STEP_COST } from "@/lib/quota"
import { resolveRequestIdentity } from "@/lib/auth/request"
import { projectQuotaEstimates, readEpisodeCount } from "@/lib/episodes"
import {
  IMAGE_EDIT_UNITS,
  IMAGE_GENERATION_UNITS,
  QUOTA_PRICING_VERSION,
  QUOTA_UNIT_MICROS,
  RENDER_UNITS,
} from "@/lib/model-pricing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const db = getDbForRequest()
    const snap = getQuota(db, resolveRequestIdentity(db, req))
    const episodeCount = readEpisodeCount(new URL(req.url).searchParams.get("episodeCount"))
    const estimates = projectQuotaEstimates(snap.remaining, episodeCount)
    return NextResponse.json(ok({
      ...snap,
      episodeCount,
      projectCost: estimates.selected.units,
      estimates,
      projectEstimate: estimates.selected,
      projectEstimates: estimates.presets,
      mediaCosts: {
        imageGenerate: IMAGE_GENERATION_UNITS,
        imageEdit: IMAGE_EDIT_UNITS,
        render: RENDER_UNITS,
        unitMicros: QUOTA_UNIT_MICROS,
      },
      // 附带口径，前端不用硬编码这些数字
      fullProjectCost: estimates.selected.units,
      tenEpisodeProjectCost: FULL_PROJECT_COST,
      stepCost: STEP_COST,
      pricingVersion: QUOTA_PRICING_VERSION,
      // 还能跑几个完整项目（前端展示更直观）
      projectsLeft: estimates.selected.projectsLeft,
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
