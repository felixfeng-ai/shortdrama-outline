'use client'

// 场次列表：分镜的输入单位。
// 一场戏 = 一个连续时空（地点或时间一换就另起一场）。
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
    <div className="space-y-3">
      {scenes.map((scene) => (
        <article key={scene.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-xs font-semibold text-sky-700">
              {scene.number}
            </span>

            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  第 {scene.episode} 集
                </span>
                <AutoTextarea
                  value={scene.location}
                  onChange={(location) => update(scene.id, { location })}
                  ariaLabel={`场 ${scene.number} 地点`}
                  placeholder="地点"
                  className="text-sm font-semibold text-slate-900"
                />
                <AutoTextarea
                  value={scene.timeOfDay}
                  onChange={(timeOfDay) => update(scene.id, { timeOfDay })}
                  ariaLabel={`场 ${scene.number} 时间`}
                  placeholder="时间"
                  className="text-xs text-slate-500"
                />
              </div>

              <AutoTextarea
                value={scene.summary}
                onChange={(summary) => update(scene.id, { summary })}
                ariaLabel={`场 ${scene.number} 内容`}
                placeholder="这场戏发生了什么"
                className="text-sm leading-relaxed text-slate-600"
              />

              <div className="flex gap-2">
                <span className="mt-1 w-14 shrink-0 text-xs font-medium text-slate-500">出场</span>
                <AutoTextarea
                  value={scene.characters.join('、')}
                  onChange={(v) => update(scene.id, { characters: v.split(/[、,，\s]+/).filter(Boolean) })}
                  ariaLabel={`场 ${scene.number} 出场角色`}
                  placeholder="角色名，用、分隔"
                  className="text-xs leading-relaxed text-slate-500"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => remove(scene.id)}
              aria-label={`删除场 ${scene.number}`}
              className="shrink-0 rounded-md p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}
