'use client'

import AutoTextarea from './AutoTextarea'
import type { Episode } from '@/lib/types'

interface Props {
  episodes: Episode[]
  onChange: (next: Episode[]) => void
}

export default function EpisodeList({ episodes, onChange }: Props) {
  const update = (id: string, patch: Partial<Episode>) =>
    onChange(episodes.map((e) => (e.id === id ? { ...e, ...patch } : e)))

  // 删除后重排集数，否则会出现「2、3、4…」这种没有第 1 集的清单
  const remove = (id: string) =>
    onChange(episodes.filter((e) => e.id !== id).map((e, i) => ({ ...e, number: i + 1 })))

  return (
    <div className="space-y-3">
      {episodes.map((episode) => (
        <article
          key={episode.id}
          className="rounded-card border border-surface-line bg-surface-card p-4 transition-shadow hover:shadow-lift"
        >
          <div className="mb-2 flex items-start gap-3">
            {/* 集数徽标 */}
            <span className="folio mt-0.5 w-6 shrink-0 text-center">{episode.number}</span>

            <div className="min-w-0 flex-1">
              <AutoTextarea
                value={episode.title}
                onChange={(title) => update(episode.id, { title })}
                ariaLabel={`第 ${episode.number} 集标题`}
                placeholder="本集标题"
                className="-ml-2 text-sm font-semibold text-ink-900"
              />
            </div>

            <button
              type="button"
              onClick={() => remove(episode.id)}
              aria-label={`删除第 ${episode.number} 集`}
              className="shrink-0 rounded-chip p-2 text-ink-200 transition-colors hover:bg-accent-50
                hover:text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>

          <div className="space-y-2 pl-10">
            <AutoTextarea
              value={episode.synopsis}
              onChange={(synopsis) => update(episode.id, { synopsis })}
              ariaLabel={`第 ${episode.number} 集剧情梗概`}
              placeholder="剧情梗概"
              className="text-sm leading-relaxed text-ink-600"
            />

            {/* 钩子是短剧的命门，单独高亮 */}
            <div className="flex gap-2 rounded-chip bg-accent-50/70 py-1.5 pl-2 pr-2">
              <span className="mt-0.5 shrink-0 rounded-chip bg-accent-100 px-1.5 py-0.5 text-[10px] font-semibold text-accent-800">
                钩子
              </span>
              <AutoTextarea
                value={episode.hook}
                onChange={(hook) => update(episode.id, { hook })}
                ariaLabel={`第 ${episode.number} 集结尾钩子`}
                placeholder="结尾钩子"
                className="-ml-1 text-sm leading-relaxed text-ink-800 hover:bg-accent-50 focus:bg-surface-card"
              />
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
