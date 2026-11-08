import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import {
  getDeliveryItem,
  getDeliveryPackageById,
  listDeliveryItems,
} from "./repo.ts"
import type {
  DeliveryPackage,
  DeliveryReviewDecision,
  DeliveryReviewFeedback,
  DeliveryReviewLink,
} from "./types.ts"

interface ReviewLinkRow {
  id: string
  package_id: string
  token_hash: string
  reviewer_name: string
  role_label: string
  expires_at: number
  revoked_at: number | null
  created_at: number
}

interface ReviewFeedbackRow {
  id: string
  link_id: string
  package_id: string
  item_id: string
  timestamp_ms: number
  body: string
  status: string
  created_at: number
}

interface ReviewDecisionRow {
  id: string
  package_id: string
  link_id: string
  reviewer_name: string
  role_label: string
  decision: string
  note: string
  created_at: number
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function toLink(row: ReviewLinkRow): DeliveryReviewLink {
  return {
    id: row.id,
    packageId: row.package_id,
    reviewerName: row.reviewer_name,
    roleLabel: row.role_label,
    expiresAt: Number(row.expires_at),
    revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
    createdAt: Number(row.created_at),
  }
}

function toFeedback(row: ReviewFeedbackRow): DeliveryReviewFeedback {
  return {
    id: row.id,
    linkId: row.link_id,
    packageId: row.package_id,
    itemId: row.item_id,
    timestampMs: Math.max(0, Number(row.timestamp_ms)),
    body: row.body,
    status: row.status === "resolved" ? "resolved" : "open",
    createdAt: Number(row.created_at),
  }
}

function toDecision(row: ReviewDecisionRow): DeliveryReviewDecision {
  return {
    id: row.id,
    packageId: row.package_id,
    linkId: row.link_id,
    reviewerName: row.reviewer_name,
    roleLabel: row.role_label,
    decision: row.decision === "approved" ? "approved" : "changes_requested",
    note: row.note,
    createdAt: Number(row.created_at),
  }
}

export function createDeliveryReviewLink(
  db: DatabaseSync,
  input: {
    packageId: string
    reviewerName: string
    roleLabel: string
    ttlMs?: number
  },
): { token: string; link: DeliveryReviewLink } {
  const pkg = getDeliveryPackageById(db, input.packageId)
  if (!pkg) throw new InputError("交付包不存在")
  if (pkg.status !== "ready") throw new InputError("交付包生成完成后才能分享审片")
  const reviewerName = input.reviewerName.trim().slice(0, 60)
  const roleLabel = input.roleLabel.trim().slice(0, 40)
  if (!reviewerName) throw new InputError("请填写审片人称呼")
  if (!roleLabel) throw new InputError("请选择或填写角色标签")
  const token = randomBytes(32).toString("base64url")
  const id = randomUUID()
  const now = Date.now()
  const expiresAt = now + Math.max(1, Math.floor(input.ttlMs ?? 7 * 24 * 60 * 60_000))
  db.prepare(
    `INSERT INTO video_delivery_review_links
      (id, package_id, token_hash, reviewer_name, role_label, expires_at, revoked_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(id, input.packageId, hashToken(token), reviewerName, roleLabel, expiresAt, now)
  db.prepare(
    "UPDATE video_delivery_packages SET review_status = 'pending', updated_at = ? WHERE id = ?",
  ).run(now, input.packageId)
  return {
    token,
    link: {
      id,
      packageId: input.packageId,
      reviewerName,
      roleLabel,
      expiresAt,
      revokedAt: null,
      createdAt: now,
    },
  }
}

export function resolveDeliveryReviewToken(
  db: DatabaseSync,
  token: string,
  now = Date.now(),
): {
  package: DeliveryPackage
  link: DeliveryReviewLink
  items: ReturnType<typeof listDeliveryItems>
  feedback: DeliveryReviewFeedback[]
  decisions: DeliveryReviewDecision[]
} | null {
  const clean = token.trim()
  if (!clean) return null
  const row = db.prepare(
    `SELECT * FROM video_delivery_review_links
     WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
  ).get(hashToken(clean), now) as ReviewLinkRow | undefined
  if (!row) return null
  const pkg = getDeliveryPackageById(db, row.package_id)
  if (!pkg || pkg.status !== "ready") return null
  db.prepare(
    "UPDATE video_delivery_review_links SET last_viewed_at = ? WHERE id = ?",
  ).run(now, row.id)
  return {
    package: pkg,
    link: toLink(row),
    items: listDeliveryItems(db, pkg.id),
    feedback: listDeliveryReviewFeedback(db, pkg.id),
    decisions: listDeliveryReviewDecisions(db, pkg.id),
  }
}

export function addDeliveryReviewFeedback(
  db: DatabaseSync,
  input: {
    token: string
    itemId: string
    timestampMs: number
    body: string
  },
): DeliveryReviewFeedback {
  const review = resolveDeliveryReviewToken(db, input.token)
  if (!review) throw new InputError("审片链接无效或已过期")
  const item = getDeliveryItem(db, review.package.id, input.itemId)
  if (!item) throw new InputError("批注对应的交付项不存在")
  const body = input.body.trim().slice(0, 1_000)
  if (!body) throw new InputError("批注内容不能为空")
  const row: ReviewFeedbackRow = {
    id: randomUUID(),
    link_id: review.link.id,
    package_id: review.package.id,
    item_id: item.id,
    timestamp_ms: Math.max(0, Math.floor(input.timestampMs)),
    body,
    status: "open",
    created_at: Date.now(),
  }
  db.prepare(
    `INSERT INTO video_delivery_review_feedback
      (id, link_id, package_id, item_id, timestamp_ms, body, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id, row.link_id, row.package_id, row.item_id,
    row.timestamp_ms, row.body, row.status, row.created_at,
  )
  return toFeedback(row)
}

export function submitDeliveryReview(
  db: DatabaseSync,
  input: {
    token: string
    decision: "approved" | "changes_requested"
    note?: string
  },
): DeliveryReviewDecision {
  const review = resolveDeliveryReviewToken(db, input.token)
  if (!review) throw new InputError("审片链接无效或已过期")
  const now = Date.now()
  const row: ReviewDecisionRow = {
    id: randomUUID(),
    package_id: review.package.id,
    link_id: review.link.id,
    reviewer_name: review.link.reviewerName,
    role_label: review.link.roleLabel,
    decision: input.decision,
    note: (input.note ?? "").trim().slice(0, 1_000),
    created_at: now,
  }
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(
      `INSERT INTO video_delivery_review_decisions
        (id, package_id, link_id, reviewer_name, role_label, decision, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id, row.package_id, row.link_id, row.reviewer_name,
      row.role_label, row.decision, row.note, row.created_at,
    )
    db.prepare(
      "UPDATE video_delivery_packages SET review_status = ?, updated_at = ? WHERE id = ?",
    ).run(row.decision, now, row.package_id)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
  return toDecision(row)
}

export function listDeliveryReviewLinks(
  db: DatabaseSync,
  packageId: string,
): DeliveryReviewLink[] {
  return (db.prepare(
    "SELECT * FROM video_delivery_review_links WHERE package_id = ? ORDER BY created_at DESC",
  ).all(packageId) as ReviewLinkRow[]).map(toLink)
}

export function revokeDeliveryReviewLink(
  db: DatabaseSync,
  packageId: string,
  linkId: string,
): boolean {
  const result = db.prepare(
    "UPDATE video_delivery_review_links SET revoked_at = ? WHERE id = ? AND package_id = ? AND revoked_at IS NULL",
  ).run(Date.now(), linkId, packageId)
  return Number(result.changes) > 0
}

export function listDeliveryReviewFeedback(
  db: DatabaseSync,
  packageId: string,
): DeliveryReviewFeedback[] {
  return (db.prepare(
    "SELECT * FROM video_delivery_review_feedback WHERE package_id = ? ORDER BY created_at DESC",
  ).all(packageId) as ReviewFeedbackRow[]).map(toFeedback)
}

export function listDeliveryReviewDecisions(
  db: DatabaseSync,
  packageId: string,
): DeliveryReviewDecision[] {
  return (db.prepare(
    "SELECT * FROM video_delivery_review_decisions WHERE package_id = ? ORDER BY created_at DESC",
  ).all(packageId) as ReviewDecisionRow[]).map(toDecision)
}
