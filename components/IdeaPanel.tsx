'use client'

import { useState } from 'react'
import QuotaBar from './QuotaBar'
import { postJson } from '@/lib/api'
import {
  GENRES,
  MAX_IDEA_LENGTH,
  MAX_KEYWORD_LENGTH,
  MIN_IDEA_LENGTH,
  type Genre,
  type IdeaCandidate,
} from '@/lib/types'

/** 几个示例想法，降低「不知道写什么」的启动成本 */
const SAMPLES = [
  '一个快递员意外继承了百万遗产',
  '外卖小哥发现自己是首富失散的儿子',
  '保洁阿姨其实是隐退的商业女王',
  '被退婚的赘婿三年后带资归来',
]

/** 几个常用关键词，点一下就填进关键词框 */
const KEYWORD_HINTS = ['快递员', '深夜', '血缘', '职场', '重生']

interface Props {
  idea: string
  onIdeaChange: (value: string) => void
  genre: Genre
  onGenreChange: (genre: Genre) => void
  onGenerate: () => void
  onReset: () => void
  loading: boolean
  /** 是否已经有任意结果，决定「重新开始」按钮是否可用 */
  hasResult: boolean
  /** 生成成功后 +1，让额度条重新查询 */
  quotaRefreshKey?: number
}

export default function IdeaPanel({
  idea,
  onIdeaChange,
  genre,
  onGenreChange,
  onGenerate,
  onReset,
  loading,
  hasResult,
  quotaRefreshKey = 0,
}: Props) {
  // 与接口的校验口径保持一致，避免「按钮能点但请求必被拒」
  const canGenerate = idea.trim().length >= MIN_IDEA_LENGTH && !loading

  // ── 关键词联想 ──
  const [keywords, setKeywords] = useState('')
  const [brainstorming, setBrainstorming] = useState(false)
  const [candidates, setCandidates] = useState<IdeaCandidate[]>([])
  const [brainstormError, setBrainstormError] = useState<string | null>(null)

  const runBrainstorm = async () => {
    const input = keywords.trim()
    if (!input || brainstorming) return
    setBrainstorming(true)
    setBrainstormError(null)
    setCandidates([])
    try {
      const data = await postJson<{ ideas: IdeaCandidate[] }>('/api/ideas', {
        keywords: input,
        genre: genre.id,
      })
      const list = Array.isArray(data.ideas) ? data.ideas : []
      setCandidates(list)
      if (list.length === 0) setBrainstormError('没想出合适的想法，换个关键词再试试')
    } catch (error) {
      setBrainstormError(error instanceof Error ? error.message : '联想失败，请重试')
    } finally {
      setBrainstorming(false)
    }
  }

  return (
    <div className="surface p-5">
      <label htmlFor="idea" className="mb-2 block text-sm font-semibold text-ink-900">
        一句话故事想法
      </label>
      <textarea
        id="idea"
        value={idea}
        onChange={(e) => onIdeaChange(e.target.value)}
        rows={4}
        maxLength={MAX_IDEA_LENGTH}
        placeholder="例如：一个快递员意外继承了百万遗产"
        className="w-full resize-none rounded-chip border border-surface-line bg-surface/70 px-3.5 py-3 text-sm leading-relaxed
          text-ink-800 placeholder:text-ink-300
          focus:border-accent-300 focus:bg-surface-card focus:outline-none focus:ring-2 focus:ring-accent-100"
      />
      <div className="mt-1.5 text-right text-xs text-ink-400">
        {idea.length} / {MAX_IDEA_LENGTH}
      </div>

      {/* 示例想法 */}
      <div className="mt-3">
        <p className="mb-2 text-xs font-medium text-ink-400">没灵感？试试这些</p>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => onIdeaChange(sample)}
              className="rounded-pill bg-surface-soft px-3 py-1.5 text-xs text-ink-600
                transition-colors hover:bg-accent-50 hover:text-accent-700
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
            >
              {sample}
            </button>
          ))}
        </div>
      </div>

      {/* ── 只想到关键词？让 AI 帮你补成一句话 ── */}
      <div className="mt-4 rounded-card border border-surface-line bg-surface/60 p-3">
        <p className="mb-2 text-xs font-medium text-ink-600">
          只有关键词也有办法 —— 输入你想到的词，AI 帮你补成几个完整想法
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            onKeyDown={(e) => {
              // 回车直接联想，省一次点击
              if (e.key === 'Enter') {
                e.preventDefault()
                void runBrainstorm()
              }
            }}
            maxLength={MAX_KEYWORD_LENGTH * 3}
            placeholder="比如：快递员、钥匙"
            className="min-w-0 flex-1 rounded-chip border border-surface-line bg-surface-card px-3 py-2 text-sm
              text-ink-800 placeholder:text-ink-300
              focus:border-accent-300 focus:outline-none focus:ring-2 focus:ring-accent-100"
          />
          <button
            type="button"
            onClick={() => void runBrainstorm()}
            disabled={!keywords.trim() || brainstorming}
            className="shrink-0 rounded-chip bg-ink-900 px-3.5 py-2 text-sm font-medium text-surface-card
              transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-ink-400 disabled:cursor-not-allowed disabled:bg-ink-100
              disabled:text-ink-300"
          >
            {brainstorming ? '联想中…' : '联想想法'}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {KEYWORD_HINTS.map((word) => (
            <button
              key={word}
              type="button"
              onClick={() => setKeywords((k) => (k.trim() ? `${k.trim()}、${word}` : word))}
              className="rounded-full border border-dashed border-surface-line bg-surface-card px-2 py-0.5
                text-[11px] text-ink-500 transition-colors hover:border-accent-300
                hover:text-accent-600 focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-accent-300"
            >
              + {word}
            </button>
          ))}
        </div>

        {brainstormError && (
          <p className="mt-2 text-xs text-accent-700">{brainstormError}</p>
        )}

        {candidates.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {candidates.map((item, index) => (
              <li key={`${item.title}-${index}`} className="relative">
                {/* 角标只给前两条：这两条是模型最看好的方向 */}
                {index < 2 && <span className="tag-ai">AI推荐</span>}
                <button
                  type="button"
                  onClick={() => onIdeaChange(item.title)}
                  className={`group w-full rounded-chip px-3 py-2 text-left transition-colors
                    hover:bg-accent-50/70 focus-visible:outline-none focus-visible:ring-2
                    focus-visible:ring-accent-300 ${index < 2 ? 'bg-accent-50/60' : 'bg-surface-soft'}`}
                >
                  <span className="block text-xs leading-relaxed text-ink-700 group-hover:text-accent-800">
                    {item.title}
                  </span>
                  {item.reason && (
                    <span className="mt-0.5 block text-[11px] text-ink-400">
                      {item.reason}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── 题材风格：影响后续全部六步，不只是这一次生成 ── */}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-xs font-medium text-ink-500">题材风格</p>
          <p className="text-[11px] text-ink-400">影响后续全部步骤</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GENRES.map((item) => {
            const active = item.id === genre.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onGenreChange(item)}
                title={item.hint || '不限定题材，让 AI 自由发挥'}
                aria-pressed={active}
                className={`rounded-pill px-3 py-1.5 text-xs transition-colors
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300 ${
                    active
                      ? 'bg-accent-100 font-semibold text-accent-700 ring-1 ring-accent-300'
                      : 'bg-surface-soft text-ink-600 hover:bg-accent-50 hover:text-accent-700'
                  }`}
              >
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 主按钮：红→深红渐变 + 极淡光晕 + 右上角星芒（参考图的「生成·剧本大纲」） */}
      <button
        type="button"
        onClick={onGenerate}
        disabled={!canGenerate}
        className="btn-primary relative mt-5 w-full px-4 py-3 focus:outline-none
          focus-visible:ring-2 focus-visible:ring-accent-300"
      >
        {loading ? '正在生成人物…' : '生成人物'}
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute -right-1 -top-2 h-5 w-5 fill-white
            drop-shadow-[0_0_7px_rgba(255,255,255,0.9)]"
        >
          <path d="M12 1.6c.8 5.4 4 8.6 9.4 9.4-5.4.8-8.6 4-9.4 9.4-.8-5.4-4-8.6-9.4-9.4 5.4-.8 8.6-4 9.4-9.4z" />
        </svg>
      </button>

      {hasResult && (
        <button
          type="button"
          onClick={onReset}
          disabled={loading}
          className="mt-2 w-full rounded-chip border border-surface-line px-4 py-2.5 text-sm text-ink-600
            transition-colors hover:border-ink-300 hover:text-ink-800 focus-visible:outline-none
            focus-visible:ring-2 focus-visible:ring-ink-300 disabled:opacity-50"
        >
          清空重来
        </button>
      )}

      <QuotaBar refreshKey={quotaRefreshKey} />

      <p className="mt-4 border-t border-surface-line pt-3 text-xs leading-relaxed text-ink-500">
        六步工作流：先定人物、搭三幕、拆分集，再定妆、分场次、出分镜。每一步都能手动修改。
      </p>
    </div>
  )
}
