import { NextResponse } from "next/server"

import { errorResponse, ok } from "@/lib/api"
import { getDbForRequest } from "@/lib/assets/store"
import { currentAuthUser } from "@/lib/auth/request"
import { AuthError } from "@/lib/auth/service"
import {
  readBillingPurchase,
  recordBillingPurchase,
} from "@/lib/billing/repo"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const db = getDbForRequest()
    const user = currentAuthUser(db, req)
    if (!user) throw new AuthError("请先登录", 401)
    const body = await req.json().catch(() => null)
    const purchase = readBillingPurchase(body)
    let status: "pending" | "verified" | "rejected" = "pending"
    let entitlement: Record<string, unknown> = {}
    const verifier = process.env.BILLING_VERIFICATION_URL?.trim()
    if (verifier) {
      const response = await fetch(verifier, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(process.env.BILLING_VERIFICATION_SECRET
            ? { Authorization: `Bearer ${process.env.BILLING_VERIFICATION_SECRET}` }
            : {}),
        },
        body: JSON.stringify({ ...purchase, userId: user.id }),
      })
      const result = await response.json().catch(() => null) as {
        verified?: boolean
        entitlement?: Record<string, unknown>
      } | null
      status = response.ok && result?.verified ? "verified" : "rejected"
      entitlement = result?.entitlement ?? {}
    }
    const transaction = recordBillingPurchase(db, user.id, purchase, status, entitlement)
    return NextResponse.json(ok({
      id: transaction.id,
      status: transaction.status,
      verified: transaction.status === "verified",
      entitlement: transaction.entitlement,
    }))
  } catch (error) {
    const { body, status } = errorResponse(error)
    return NextResponse.json(body, { status })
  }
}
