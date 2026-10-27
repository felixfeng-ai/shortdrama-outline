'use client'

// 场次剧本：分镜的输入单位。
// 一场戏 = 一个连续时空（地点或时间一换就另起一场）。
// 这里描述的是整场戏，不是镜头；到下一步才会拆成多个镜头。
import AutoTextarea from './AutoTextarea'
import type { Scene } from '@/lib/assets/types'

interface Props {
  scenes: Scene[]
  onChange: (next: Scene[]) => void
}

export default function SceneList({ scenes, onChange }: Props) {
  const update = (id: string, patch: Partial<Scene>) =>
    onChange(scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)))

  const remove = (id: string) =>
    onChange(scenes.filter((s) => s.id !== id).map((s, i) => ({ ...s, number: i + 1 })))

  return (
    <div className="ledger-list">
      {scenes.map((scene) => (
        <article key={scene.id} className="scene-card ledger-row">
          <header className="scene-card-head">
            <span className="scene-card-number">场 {scene.number}</span>
            <span className="scene-card-type">场次剧本</span>
            <span className="scene-card-meta">第 {scene.episode} 集</span>
            <button
              type="button"
              onClick={() => remove(scene.id)}
              aria-label={`删除第 ${scene.episode} 集场 ${scene.number}`}
              className="scene-card-delete"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </header>

          <div className="scene-card-setting">
            <div>
              <span className="scene-card-label">地点</span>
              <AutoTextarea
                value={scene.location}
                onChange={(location) => update(scene.id, { location })}
                ariaLabel={`场 ${scene.number} 地点`}
                placeholder="地点"
                className="text-sm font-semibold text-ink-900"
              />
            </div>
            <div>
              <span className="scene-card-label">时间</span>
              <AutoTextarea
                value={scene.timeOfDay}
                onChange={(timeOfDay) => update(scene.id, { timeOfDay })}
                ariaLabel={`场 ${scene.number} 时间`}
                placeholder="时间"
                className="text-xs text-ink-400"
              />
            </div>
          </div>

          <div className="scene-card-field">
            <span className="scene-card-label">本场剧情</span>
            <div className="scene-card-summary">
                <AutoTextarea
                value={scene.summary}
                onChange={(summary) => update(scene.id, { summary })}
                ariaLabel={`场 ${scene.number} 内容`}
                placeholder="这场戏发生了什么"
                className="text-sm leading-relaxed text-ink-600"
              />
            </div>
          </div>

          <div className="scene-card-field">
            <span className="scene-card-label">本场出场</span>
            <div className="scene-card-cast">
                <AutoTextarea
                  value={scene.characters.join('、')}
                  onChange={(v) => update(scene.id, { characters: v.split(/[、,，\s]+/).filter(Boolean) })}
                  ariaLabel={`场 ${scene.number} 出场角色`}
                  placeholder="角色名，用、分隔"
                  className="text-xs leading-relaxed text-ink-500"
                />
            </div>
          </div>

          <p className="scene-card-footnote">这一场会拆成多个镜头</p>
        </article>
      ))}
    </div>
  )
}
