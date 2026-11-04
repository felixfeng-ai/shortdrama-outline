import type { DatabaseSync } from "node:sqlite"

import { InputError } from "../api.ts"
import { createSnapshot, getSnapshot, type Snapshot } from "../assets/repo.ts"
import { getLocalizationBranch } from "./branches.ts"
import type { BranchContext } from "./context.ts"

export type VisualLocalizationIssueCode =
  | "readable-text"
  | "currency"
  | "phone-ui"
  | "signage"

export interface VisualLocalizationIssue {
  code: VisualLocalizationIssueCode
  severity: "blocking" | "warning"
  message: string
}

export interface VisualLocalizationSuggestion {
  entityId: string
  shot: number
  episode: number
  originalPrompt: string
  suggestedPrompt: string
  issues: VisualLocalizationIssue[]
}

function localizedCurrency(context: BranchContext): string {
  if (context.profile.locale === "en-US") return "USD"
  if (context.profile.locale === "id-ID") return "IDR"
  return "the local currency confirmed for the target market"
}

function appendConstraint(prompt: string, constraint: string): string {
  const clean = prompt.trim()
  if (!constraint || clean.includes(constraint)) return clean
  return clean ? `${clean} ${constraint}` : constraint
}

/**
 * 该检查不试图判断文化好坏，只找“下游画面会明显露馅”的确定性问题。
 * 多语言可读文字默认不在画面里生成，交给剪辑和字幕层处理，避免模型拼出乱码。
 */
export function analyzeVisualLocalization(
  shots: Array<Record<string, unknown>>,
  context: BranchContext,
): VisualLocalizationSuggestion[] {
  const suggestions: VisualLocalizationSuggestion[] = []
  const currency = localizedCurrency(context)
  for (const shot of shots) {
    const prompt = typeof shot.prompt === "string" ? shot.prompt : ""
    if (!prompt) continue
    const issues: VisualLocalizationIssue[] = []
    if (/[\u3400-\u9fff]/.test(prompt)) {
      issues.push({
        code: "readable-text",
        severity: "blocking",
        message: "画面 Prompt 包含中文可读文字，目标市场会出现语言穿帮",
      })
    }
    if (/sign|billboard|招牌|海报/i.test(prompt)) {
      issues.push({
        code: "signage",
        severity: "warning",
        message: "招牌或海报文字建议改为无文字图形，后期再替换",
      })
    }
    if (/[¥￥]|RMB|CNY/i.test(prompt)) {
      issues.push({
        code: "currency",
        severity: "warning",
        message: `货币需要改为 ${currency}`,
      })
    }
    if (/微信|支付宝|wechat|alipay/i.test(prompt)) {
      issues.push({
        code: "phone-ui",
        severity: "warning",
        message: "手机 UI 或支付界面需要替换为目标市场常见形态",
      })
    }
    if (issues.length === 0) continue

    let suggestedPrompt = prompt
      .replace(/[¥￥]/g, currency)
      .replace(/RMB|CNY/gi, currency)
      .replace(/微信/gi, "a local messaging app")
      .replace(/支付宝/gi, "a local payment app")
      .replace(/WeChat/gi, "a local messaging app")
      .replace(/Alipay/gi, "a local payment app")
    suggestedPrompt = appendConstraint(
      suggestedPrompt,
      `Localized visual constraints: no readable text or CJK signage; use abstract sign shapes and ${currency} for currency.`,
    )
    suggestions.push({
      entityId: String(shot.entityId || shot.id || ""),
      shot: Number(shot.shot) || 0,
      episode: Number(shot.episode) || 0,
      originalPrompt: prompt,
      suggestedPrompt,
      issues,
    })
  }
  return suggestions
}

/**
 * 视觉建议只在用户确认后写入海外分支的新分镜快照。
 * 原始 shots 作为父快照保留；失败时不会产生半更新。
 */
export function saveLocalizedVisualShots(
  db: DatabaseSync,
  projectId: string,
  branchId: string,
  ownerId: string,
  sourceSnapshotId: string,
  suggestions: VisualLocalizationSuggestion[],
  now = Date.now(),
): Snapshot {
  if (!getLocalizationBranch(db, projectId, branchId, ownerId)) {
    const error = new Error("本地化分支不存在或无权访问") as Error & { status: number }
    error.status = 403
    throw error
  }
  const source = getSnapshot(db, sourceSnapshotId)
  if (!source || source.projectId !== projectId || source.kind !== "shots") {
    throw new InputError("本地化源分镜快照不存在")
  }
  if (!Array.isArray(source.payload)) throw new InputError("源分镜数据不是数组")
  const byTarget = new Map(suggestions.map((suggestion) => [
    `${suggestion.entityId}:${suggestion.shot}`,
    suggestion,
  ]))
  const payload = (source.payload as Array<Record<string, unknown>>).map((shot) => {
    const key = `${String(shot.entityId || shot.id || "")}:${Number(shot.shot) || 0}`
    const suggestion = byTarget.get(key)
    return suggestion
      ? {
        ...shot,
        prompt: suggestion.suggestedPrompt,
        localization: {
          sourcePrompt: suggestion.originalPrompt,
          issues: suggestion.issues,
          savedAt: now,
        },
      }
      : shot
  })
  return createSnapshot(db, {
    projectId,
    branchId,
    kind: "shots",
    payload,
    parents: [source.id],
  })
}
