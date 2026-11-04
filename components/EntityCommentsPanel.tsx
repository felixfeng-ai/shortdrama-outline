'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  createProjectComment,
  updateProjectComment,
} from '@/lib/assets/api'
import type { EntityComment, EntityCommentTarget } from '@/lib/entity-comments'
import type { AgentEntity } from '@/lib/agent/tools'

interface Props {
  projectId: string | null
  entities: AgentEntity[]
  comments: EntityComment[]
  onCreated: (comment: EntityComment) => void
  onUpdated: (comment: EntityComment) => void
}

const TYPE_LABEL: Record<EntityCommentTarget, string> = {
  character: '角色',
  place: '地点',
  episode: '分集',
  shot: '镜头',
}

export default function EntityCommentsPanel({
  projectId,
  entities,
  comments,
  onCreated,
  onUpdated,
}: Props) {
  const [targetKey, setTargetKey] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (entities.length === 0) {
      setTargetKey('')
      return
    }
    if (!entities.some((entity) => `${entity.type}:${entity.id}` === targetKey)) {
      setTargetKey(`${entities[0].type}:${entities[0].id}`)
    }
  }, [entities, targetKey])

  const selected = entities.find((entity) => `${entity.type}:${entity.id}` === targetKey) ?? null
  const visibleComments = useMemo(
    () => comments.filter((comment) =>
      selected
      && comment.targetType === selected.type
      && comment.targetId === selected.id
    ),
    [comments, selected],
  )
  const openCount = comments.filter((comment) => comment.status === 'open').length

  async function submit() {
    if (!projectId || !selected || !body.trim() || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const comment = await createProjectComment(projectId, {
        targetType: selected.type,
        targetId: selected.id,
        body,
      })
      onCreated(comment)
      setBody('')
      setNotice('批注已加入当前实体')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '批注保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function resolve(comment: EntityComment) {
    if (!projectId || busy) return
    setBusy(true)
    try {
      const updated = await updateProjectComment(projectId, comment.id, { status: 'resolved' })
      onUpdated(updated)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '批注状态更新失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-panel border border-surface-line bg-surface-raised px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold text-ink-800">实体批注</h3>
          <p className="mt-0.5 text-[9.5px] leading-relaxed text-ink-400">
            批注只跟随稳定实体 id，不随剧情文字移动。
          </p>
        </div>
        <span className="shrink-0 rounded-chip border border-surface-line px-2 py-1 font-mono text-[9px] text-ink-400">
          {openCount} 待处理
        </span>
      </div>

      {entities.length === 0 ? (
        <p className="mt-3 border-t border-surface-line pt-3 text-[10px] text-ink-400">
          当前项目还没有可批注的实体。
        </p>
      ) : (
        <>
          <label className="mt-3 grid gap-1.5">
            <span className="text-[9px] text-ink-400">批注对象</span>
            <select
              value={targetKey}
              onChange={(event) => setTargetKey(event.target.value)}
              className="min-h-9 rounded-chip border border-surface-line bg-surface-base px-2.5 text-[10px] text-ink-700 outline-none focus:border-accent-300"
            >
              {entities.map((entity) => (
                <option key={`${entity.type}:${entity.id}`} value={`${entity.type}:${entity.id}`}>
                  {TYPE_LABEL[entity.type]} · {entity.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-2 grid gap-1.5">
            <span className="text-[9px] text-ink-400">对 {selected?.name} 的具体意见</span>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={3}
              maxLength={2_000}
              placeholder="说清保留什么、改什么，Agent 只会为这个实体生成待确认修改。"
              className="resize-y rounded-chip border border-surface-line bg-surface-base px-2.5 py-2 text-[10px] leading-relaxed text-ink-700 outline-none focus:border-accent-300"
            />
          </label>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="min-w-0 text-[9px] text-ink-400" role="status" aria-live="polite">
              {notice || (projectId ? '确认前不会改动正文' : '请先保存项目')}
            </p>
            <button
              type="button"
              disabled={!projectId || !selected || !body.trim() || busy}
              onClick={() => void submit()}
              className="min-h-9 shrink-0 rounded-chip bg-accent-700 px-3 text-[9.5px] font-medium text-white disabled:cursor-wait disabled:opacity-45"
            >
              {busy ? '保存中…' : '加入批注'}
            </button>
          </div>

          {visibleComments.length > 0 && (
            <div className="mt-3 border-t border-surface-line pt-2">
              {visibleComments.slice(0, 8).map((comment) => (
                <div
                  key={comment.id}
                  className="flex items-start justify-between gap-2 border-b border-surface-line/70 py-2 last:border-b-0"
                >
                  <p className={`min-w-0 text-[10px] leading-relaxed ${comment.status === 'resolved' ? 'text-ink-300 line-through' : 'text-ink-600'}`}>
                    {comment.body}
                  </p>
                  {comment.status === 'open' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void resolve(comment)}
                      className="shrink-0 text-[9px] text-accent-700 hover:text-accent-800"
                    >
                      已处理
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}
