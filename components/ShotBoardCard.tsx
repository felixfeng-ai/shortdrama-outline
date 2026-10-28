'use client'

import type { Shot } from '@/lib/assets/types'
import type { GenerationStatus } from '@/lib/generation/types'
import type { ShotQcResult } from '@/lib/assets/qc'

interface Props {
  shot: Shot
  active: boolean
  thumbnailUrl?: string | null
  taskStatus?: GenerationStatus | null
  qc?: ShotQcResult | null
  onSelect: (id: string) => void
}

function statusOf(shot: Shot, taskStatus?: GenerationStatus | null) {
  if (taskStatus === 'queued') return { label: '等待生成', tone: 'waiting' }
  if (taskStatus === 'running') return { label: '生成中', tone: 'running' }
  if (taskStatus === 'failed') return { label: '生成失败', tone: 'failed' }
  if (taskStatus === 'succeeded') return { label: '首帧已生成', tone: 'done' }
  if (taskStatus === 'canceled') return { label: '已停止', tone: 'muted' }
  if (shot.status === 'done') return { label: '已出图', tone: 'done' }
  if (shot.status === 'rework') return { label: '需返修', tone: 'failed' }
  return { label: '待出图', tone: 'muted' }
}

export default function ShotBoardCard({
  shot,
  active,
  thumbnailUrl,
  taskStatus,
  qc,
  onSelect,
}: Props) {
  const status = statusOf(shot, taskStatus)
  const codes = new Set(qc?.issues.map((issue) => issue.code) ?? [])
  const qcTags: string[] = []
  if (codes.has('missing-anchor') || codes.has('locked-trait')) qcTags.push('缺锚点')
  if (codes.has('stale-reference')) qcTags.push('旧参考')
  if (codes.has('missing-reference')) qcTags.push('缺图')
  if (codes.has('invalid-duration')) qcTags.push('时长不兼容')
  return (
    <button
      type="button"
      data-shot-id={shot.id}
      aria-pressed={active}
      onClick={() => onSelect(shot.id)}
      className={`shot-board-card ${active ? 'is-active' : ''}`}
    >
      <span className="shot-board-thumb">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={`第 ${shot.shot} 镜首帧`} loading="lazy" />
        ) : (
          <span className="shot-board-placeholder">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="m6 17 4-4 3 3 2-2 3 3M15.5 9h.01" />
            </svg>
            待首帧
          </span>
        )}
      </span>

      <span className="shot-board-main">
        <span className="shot-board-head">
          <b>第 {String(shot.shot).padStart(2, '0')} 镜</b>
          <span className={`shot-board-status is-${status.tone}`}>{status.label}</span>
        </span>
        <span className="shot-board-scene">{shot.scene || '场景未标注'}</span>
        <span className="shot-board-action">{shot.action || shot.prompt || '动作待补'}</span>
        <span className="shot-board-meta">
          {shot.characters.length > 0 ? shot.characters.join('、') : '无出场角色'}
          <i>·</i>
          {shot.shotSize || '中景'}
          <i>·</i>
          {shot.params.ratio}
          <i>·</i>
          {shot.params.duration}s
        </span>
        {qcTags.length > 0 && (
          <span className="shot-board-qc" aria-label="镜头质检问题">
            {qcTags.map((tag) => <em key={tag}>{tag}</em>)}
          </span>
        )}
      </span>

      <span className="shot-board-side">
        {qc?.issues.length ? <em>{qc.issues.length} 项</em> : null}
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m7.5 4.5 5 5-5 5" />
        </svg>
      </span>
    </button>
  )
}
