'use client'

import AutoTextarea from './AutoTextarea'
import CopyButton from './CopyButton'
import KeyframePanel from './KeyframePanel'
import { CAMERA_MOVES, SHOT_DURATIONS, SHOT_SIZES, type Shot, type ShotStatus } from '@/lib/assets/types'
import type { LookBook } from '@/lib/look'

interface Props {
  shot: Shot
  projectId: string | null
  onEnsureProject: () => Promise<string | null>
  look: LookBook
  episodeCount: number
  onUpdate: (id: string, patch: Partial<Shot>) => void
  onRemove: (id: string) => void
}

const STATUS_OPTIONS: Array<{ value: ShotStatus; label: string }> = [
  { value: 'todo', label: '待出图' },
  { value: 'done', label: '已出图' },
  { value: 'rework', label: '需返修' },
]

export default function ShotInspector({
  shot,
  projectId,
  onEnsureProject,
  look,
  episodeCount,
  onUpdate,
  onRemove,
}: Props) {
  const episodeOptions = Math.max(1, Math.floor(episodeCount), shot.episode)

  return (
    <section className="shot-inspector" aria-label={`第 ${shot.shot} 镜属性`}>
      <header className="shot-inspector-head">
        <div className="min-w-0">
          <p>当前镜头</p>
          <h3>第 {String(shot.shot).padStart(2, '0')} 镜 · {shot.scene || '场景未标注'}</h3>
        </div>
        <select
          value={shot.status}
          onChange={(event) => onUpdate(shot.id, { status: event.target.value as ShotStatus })}
          aria-label={`第 ${shot.shot} 镜状态`}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </header>

      <div className="shot-inspector-fields">
        <label>
          <span>所属集</span>
          <select
            value={shot.episode}
            onChange={(event) => onUpdate(shot.id, { episode: Number(event.target.value) })}
          >
            <option value={0}>未标注</option>
            {Array.from({ length: episodeOptions }, (_, index) => index + 1).map((episode) => (
              <option key={episode} value={episode}>第 {episode} 集</option>
            ))}
          </select>
        </label>

        <label>
          <span>场景</span>
          <AutoTextarea
            value={shot.scene}
            onChange={(scene) => onUpdate(shot.id, { scene })}
            ariaLabel={`第 ${shot.shot} 镜场景`}
            placeholder="场景"
          />
        </label>

        <label>
          <span>动作</span>
          <AutoTextarea
            value={shot.action}
            onChange={(action) => onUpdate(shot.id, { action })}
            ariaLabel={`第 ${shot.shot} 镜动作`}
            placeholder="动作描述"
          />
        </label>

        <label>
          <span>出场角色</span>
          <AutoTextarea
            value={shot.characters.join('、')}
            onChange={(value) => onUpdate(shot.id, {
              characters: value.split(/[、,，\s]+/).filter(Boolean),
            })}
            ariaLabel={`第 ${shot.shot} 镜出场角色`}
            placeholder="角色名，用、分隔"
          />
        </label>

        <label>
          <span>说话人</span>
          <AutoTextarea
            value={shot.speaker}
            onChange={(speaker) => onUpdate(shot.id, { speaker })}
            ariaLabel={`第 ${shot.shot} 镜说话人`}
            placeholder="纯画面镜头留空"
          />
        </label>

        <label>
          <span>台词</span>
          <AutoTextarea
            value={shot.dialogue}
            onChange={(dialogue) => onUpdate(shot.id, { dialogue })}
            ariaLabel={`第 ${shot.shot} 镜台词`}
            placeholder="纯画面镜头留空"
          />
        </label>
      </div>

      <section className="shot-inspector-section" aria-label="镜头执行参数">
        <div className="shot-inspector-section-title">
          <h4>镜头执行参数</h4>
          <span>{shot.params.ratio} · {shot.params.duration}s</span>
        </div>
        <div className="shot-inspector-params">
          <label>
            <span>景别</span>
            <select
              value={shot.shotSize || '中景'}
              onChange={(event) => onUpdate(shot.id, { shotSize: event.target.value })}
            >
              {SHOT_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <label>
            <span>运镜</span>
            <select
              value={shot.camera}
              onChange={(event) => onUpdate(shot.id, { camera: event.target.value })}
            >
              {CAMERA_MOVES.map((move) => <option key={move} value={move}>{move}</option>)}
            </select>
          </label>
          <label>
            <span>画幅</span>
            <select
              value={shot.params.ratio}
              onChange={(event) => onUpdate(shot.id, {
                params: { ...shot.params, ratio: event.target.value },
              })}
            >
              <option value="9:16">竖屏 9:16</option>
              <option value="16:9">横屏 16:9</option>
            </select>
          </label>
          <label>
            <span>时长</span>
            <select
              value={String(shot.params.duration)}
              onChange={(event) => onUpdate(shot.id, {
                params: { ...shot.params, duration: Number(event.target.value) },
              })}
            >
              {SHOT_DURATIONS.map((duration) => (
                <option key={duration} value={duration}>{duration} 秒</option>
              ))}
            </select>
          </label>
          <label className="shot-inspector-check">
            <input
              type="checkbox"
              checked={shot.params.lastFrame}
              onChange={(event) => onUpdate(shot.id, {
                params: { ...shot.params, lastFrame: event.target.checked },
              })}
            />
            接下一镜首帧
          </label>
        </div>
      </section>

      <KeyframePanel
        projectId={projectId}
        onEnsureProject={onEnsureProject}
        targetType="shot"
        targetId={shot.entityId}
        prompt={shot.prompt || shot.action || shot.scene}
        aspect={shot.params.ratio === '16:9' ? 'landscape' : 'vertical'}
        actionLabel="生成首帧"
        look={look}
      />

      <section className="shot-inspector-section" aria-label="本镜 Prompt">
        <div className="shot-inspector-section-title">
          <h4>本镜 Prompt</h4>
          <CopyButton text={shot.prompt} label="复制" />
        </div>
        <AutoTextarea
          value={shot.prompt}
          onChange={(prompt) => onUpdate(shot.id, { prompt })}
          ariaLabel={`第 ${shot.shot} 镜提示词`}
          placeholder="English prompt"
          className="shot-inspector-prompt"
        />
      </section>

      <div className="shot-inspector-refs">
        <p>本镜参考图</p>
        {shot.refImages.length > 0 ? (
          <div>{shot.refImages.map((ref) => <span key={ref}>{ref}</span>)}</div>
        ) : (
          <em>无</em>
        )}
        {shot.missingRefFor.length > 0 && (
          <button
            type="button"
            onClick={() => {
              document.getElementById('visual-anchors')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              window.dispatchEvent(new CustomEvent('chengju:focus-vc', { detail: shot.missingRefFor }))
            }}
          >
            缺 {shot.missingRefFor.join('、')} · 去定妆挂图
          </button>
        )}
      </div>

      <button type="button" className="shot-inspector-delete" onClick={() => onRemove(shot.id)}>
        删除这一镜
      </button>
    </section>
  )
}
