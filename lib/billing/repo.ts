import type { DatabaseSync } from "node:sqlite"
import { createHash, randomUUID } from "node:crypto"

export type BillingPlatform = "ios" | "android"
export type BillingStatus = "pending" | "verified" | "rejected"

export interface BillingPurchaseInput {
  platform: BillingPlatform
  productId: string
  transactionId: string
  purchaseToken: string
}

export interface BillingTransaction extends BillingPurchaseInput {
  id: string
  ownerId: string
  status: BillingStatus
  entitlement: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

function tokenHash(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function readBillingPurchase(value: unknown): BillingPurchaseInput {
  if (!value || typeof value !== "object") throw new Error("购买凭据格式不正确")
  const record = value as Record<string, unknown>
  const platform = record.platform
  if (platform !== "ios" && platform !== "android") throw new Error("购买平台不正确")
  const productId = typeof record.productId === "string" ? record.productId.trim() : ""
  const transactionId = typeof record.transactionId === "string" ? record.transactionId.trim() : ""
  const purchaseToken = typeof record.purchaseToken === "string" ? record.purchaseToken.trim() : ""
  if (!productId || !transactionId || !purchaseToken) throw new Error("购买凭据不完整")
  if (purchaseToken.length > 100_000) throw new Error("购买凭据过大")
  return { platform, productId, transactionId, purchaseToken }
}

function rowToTransaction(row: Record<string, unknown>): BillingTransaction {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    platform: row.platform as BillingPlatform,
    productId: String(row.product_id),
    transactionId: String(row.transaction_id),
    purchaseToken: "",
    status: row.status as BillingStatus,
    entitlement: JSON.parse(String(row.entitlement_json || "{}")),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }
}

export function recordBillingPurchase(
  db: DatabaseSync,
  ownerId: string,
  input: BillingPurchaseInput,
  status: BillingStatus = "pending",
  entitlement: Record<string, unknown> = {},
): BillingTransaction {
  const now = Date.now()
  db.prepare(
    `INSERT INTO billing_transactions
      (id, owner_id, platform, product_id, transaction_id, purchase_token_hash,
       status, entitlement_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, transaction_id) DO UPDATE SET
       status = excluded.status,
       entitlement_json = excluded.entitlement_json,
       updated_at = excluded.updated_at`,
  ).run(
    randomUUID(),
    ownerId,
    input.platform,
    input.productId,
    input.transactionId,
    tokenHash(input.purchaseToken),
    status,
    JSON.stringify(entitlement),
    now,
    now,
  )
  const row = db.prepare(
    "SELECT * FROM billing_transactions WHERE owner_id = ? AND transaction_id = ?",
  ).get(ownerId, input.transactionId) as Record<string, unknown> | undefined
  if (!row) throw new Error("购买交易保存失败")
  return rowToTransaction(row)
}
