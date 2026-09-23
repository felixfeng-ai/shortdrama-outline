'use client'

import AutoTextarea from './AutoTextarea'
import type { Character } from '@/lib/types'

interface Props {
  characters: Character[]
  onChange: (next: Character[]) => void
  /** 单独重新生成某个角色 */
  onRegenerate: (id: string) => void
  /** 正在重新生成的角色 id，用于显示局部 loading */
  regeneratingId: string | null
}

const FIELDS: { key: keyof Omit<Character, 'id' | 'name'>; label: string }[] = [
  { key: 'identity', label: '身份' },
  { key: 'personality', label: '性格' },
  { key: 'motivation', label: '核心动机' },
  { key: 'arc', label: '人物弧光' },
]

export default function CharacterList({ characters, onChange, onRegenerate, regeneratingId }: Props) {
  // 所有编辑都返回新数组，不改原对象
  const update = (id: string, patch: Partial<Character>) =>
    onChange(characters.map((c) => (c.id === id ? { ...c, ...patch } : c)))

  const remove = (id: string) => onChange(characters.filter((c) => c.id !== id))

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {characters.map((character, index) => {
        const isRegenerating = regeneratingId === character.id

        return (
          <article
            key={character.id}
            className={`relative rounded-xl border border-slate-200 bg-white p-4 transition-opacity
              ${isRegenerating ? 'opacity-50' : ''}`}
          >
            {/* 姓名 + 操作 */}
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span className="shrink-0 text-xs font-medium text-slate-400">
                  角色 {index + 1}
                </span>
                <AutoTextarea
                  value={character.name}
                  onChange={(name) => update(character.id, { name })}
                  ariaLabel={`角色 ${index + 1} 姓名`}
                  placeholder="角色姓名"
                  className="-ml-2 text-base font-semibold text-slate-900"
                />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onRegenerate(character.id)}
                  disabled={isRegenerating}
                  title="单独重新生成这个角色"
                  className="rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100
                    hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-brand-300 disabled:opacity-50"
                >
                  换一个
                </button>
                <button
                  type="button"
                  onClick={() => remove(character.id)}
                  title="删除这个角色"
                  aria-label={`删除角色 ${character.name}`}
                  className="rounded-md p-2 text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path
                      fillRule="evenodd"
                      d="M8.75 1.5a1.5 1.5 0 0 0-1.5 1.5v.75H4a1 1 0 0 0 0 2h.4l.7 9.1A2.25 2.25 0 0 0 7.34 17h5.32a2.25 2.25 0 0 0 2.24-2.15l.7-9.1h.4a1 1 0 1 0 0-2h-3.25V3a1.5 1.5 0 0 0-1.5-1.5h-2.5Zm1.75 5a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Zm3 0a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6Z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* 字段 */}
            <dl className="space-y-2">
              {FIELDS.map(({ key, label }) => (
                <div key={key} className="flex gap-2">
                  <dt className="mt-1 w-14 shrink-0 text-xs font-medium text-slate-500">{label}</dt>
                  <dd className="min-w-0 flex-1">
                    <AutoTextarea
                      value={character[key]}
                      onChange={(value) => update(character.id, { [key]: value })}
                      ariaLabel={`${character.name} 的${label}`}
                      placeholder={`${label}待补充`}
                      className="text-sm leading-relaxed text-slate-600"
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        )
      })}
    </div>
  )
}
