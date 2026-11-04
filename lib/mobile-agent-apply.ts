import type { DatabaseSync } from 'node:sqlite'

import { latestSnapshot, type Snapshot } from './assets/repo.ts'
import { persistEditedArtifact } from './assets/persist.ts'
import { inspectEditTarget } from './agent/edits.ts'

export type MobileShotEditTarget = 'prompt' | 'action'

export interface MobileShotEdit {
  /** 新客户端优先使用稳定 ID；保留 shot 仅用于旧 App 兼容。 */
  targetId?: string
  shot?: number
  expectedText?: string
  target: MobileShotEditTarget
  text: string
  summary: string
}

function inputError(message: string, status = 400): Error {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

function readText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function readMobileShotEdit(value: unknown): MobileShotEdit {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const targetId = readText(source.targetId, 160)
  const shot = Number(source.shot)
  if (!targetId && (!Number.isInteger(shot) || shot < 1)) {
    throw inputError('要修改的镜头不存在')
  }
  const target = String(source.target ?? '')
  if (target !== 'prompt' && target !== 'action') {
    throw inputError('修改目标只能是 prompt 或 action')
  }
  const text = readText(source.text, 2000)
  if (!text) throw inputError('改写后的内容不能为空')
  if (typeof source.text === 'string' && source.text.trim().length > 2000) {
    throw inputError('改写内容过长')
  }
  return {
    ...(targetId ? { targetId } : { shot }),
    ...(typeof source.expectedText === 'string'
      ? { expectedText: source.expectedText }
      : {}),
    target,
    text,
    summary: readText(source.summary, 120) || (target === 'prompt' ? '改写本镜提示词' : '改写本镜动作'),
  }
}

export function applyShotEdit(
  payload: unknown,
  edit: MobileShotEdit,
): { shots: Record<string, unknown>[]; shot: Record<string, unknown> } {
  if (!Array.isArray(payload)) throw inputError('分镜数据不是数组，无法写回')
  if (payload.some((item) => !item || typeof item !== 'object')) {
    throw inputError('分镜数据包含无法识别的项目，已停止写回')
  }
  const shots = payload as Record<string, unknown>[]
  const index = edit.targetId
    ? shots.findIndex((shot) =>
        String(shot.entityId ?? '') === edit.targetId
        || String(shot.id ?? '') === edit.targetId
      )
    : shots.findIndex((shot) => Number(shot.shot) === edit.shot)
  if (index < 0) {
    throw inputError(edit.targetId
      ? '目标镜头已不存在，请重新读取项目'
      : `第 ${edit.shot} 镜不存在`, 409)
  }

  if (edit.targetId && edit.expectedText !== undefined) {
    const status = inspectEditTarget(
      typeof shots[index][edit.target] === 'string'
        ? String(shots[index][edit.target])
        : undefined,
      edit.expectedText,
    )
    if (status === 'missing') throw inputError('目标字段已不存在，请重新读取项目', 409)
    if (status === 'drift') {
      throw inputError('目标已改动，旧建议未覆盖当前文本，请重新读取后再写回', 409)
    }
  }

  const updated = shots.map((shot, shotIndex) =>
    shotIndex === index ? { ...shot, [edit.target]: edit.text } : shot,
  )
  return { shots: updated, shot: updated[index] }
}

export function applyMobileShotEdit(
  db: DatabaseSync,
  input: { projectId: string; baseSnapshotId: string; edit: MobileShotEdit },
): { snapshot: Snapshot; shot: Record<string, unknown> } {
  const latest = latestSnapshot(db, input.projectId, 'shots')
  if (!latest) throw inputError('这个项目还没有分镜，无法写回', 409)
  if (latest.id !== input.baseSnapshotId) {
    throw inputError('分镜已在 Web 或其他设备更新，请重新读取后再写回', 409)
  }
  const applied = applyShotEdit(latest.payload, input.edit)
  return {
    snapshot: persistEditedArtifact(db, input.projectId, 'shots', applied.shots),
    shot: applied.shot,
  }
}
