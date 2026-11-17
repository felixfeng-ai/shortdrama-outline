import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { adminRequestContext } from "@/lib/admin/request"
import { todayKey } from "@/lib/quota"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { db } = adminRequestContext(req)
    const now = Date.now()
    const day = todayKey(now)
    const count = (sql: string, ...params: Array<string | number>): number => {
      const row = db.prepare(sql).get(...params) as { n: number }
      return Number(row.n) || 0
    }
    const used = db.prepare(
      "SELECT COALESCE(SUM(units), 0) AS n FROM usage_log WHERE day = ?",
    ).get(day) as { n: number }
    const recentOperations = db.prepare(
      `SELECT id, action, target_user_id, detail_json, created_at
       FROM admin_audit_log
       ORDER BY created_at DESC
       LIMIT 10`,
    ).all().map((raw) => {
      const row = raw as {
        id: string
        action: string
        target_user_id: string
        detail_json: string
        created_at: number
      }
      let detail: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(row.detail_json) as unknown
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          detail = parsed as Record<string, unknown>
        }
      } catch {}
      return {
        id: row.id,
        action: row.action,
        targetUserId: row.target_user_id,
        detail,
        createdAt: Number(row.created_at),
      }
    })
    return NextResponse.json(ok({
      users: count("SELECT COUNT(*) AS n FROM users"),
      projects: count("SELECT COUNT(*) AS n FROM projects"),
      generationTasks: count("SELECT COUNT(*) AS n FROM generation_tasks"),
      succeededTasks: count(
        "SELECT COUNT(*) AS n FROM generation_tasks WHERE status = 'succeeded'",
      ),
      failedTasks: count(
        "SELECT COUNT(*) AS n FROM generation_tasks WHERE status = 'failed'",
      ),
      quotaUsedToday: Number(used.n) || 0,
      activeQuotaOverrides: count(
        "SELECT COUNT(*) AS n FROM user_quota_overrides WHERE expires_at > ?",
        now,
      ),
      openFeedback: count(
        "SELECT COUNT(*) AS n FROM mobile_feedback WHERE status = 'open'",
      ),
      recentAppErrors: count(
        "SELECT COUNT(*) AS n FROM app_analytics_events WHERE event_name = 'app_error' AND created_at >= ?",
        now - 7 * 86_400_000,
      ),
      vitalsSamples: count(
        "SELECT COUNT(*) AS n FROM web_vitals_events WHERE created_at >= ?",
        now - 7 * 86_400_000,
      ),
      recentOperations,
    }), { headers: { "cache-control": "no-store" } })
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}
