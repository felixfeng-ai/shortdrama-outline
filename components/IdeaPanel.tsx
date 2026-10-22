'use client'

import { useState } from 'react'
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

/**
 * 首屏只放 demo 里那六个标签（短剧 + 漫剧最常用的），
 * 其余题材收在「更多题材」后面——首屏和 demo 保持一致，功能一个不少。
 */
const FEATURED_GENRES = ['urban', 'suspense', 'costume']

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
  /** 首访：还没写想法、也没有结果时，隐藏说明与关键词提示，只留主线 */
  firstRun?: boolean
}

/**
 * 故事输入区。排布与 .tmp-visual3/demo.html 的中间列一一对应：
 * 一张大卡（灵感输入 + 题材标签 + 居中的生成按钮）+ 两张小卡
 * （示例想法、关键词联想），额度与说明收在下面。
 */
export default function IdeaPanel({
  idea,
  onIdeaChange,
  genre,
  onGenreChange,
  onGenerate,
  onReset,
  loading,
  hasResult,
  firstRun = false,
}: Props) {
  // 与接口的校验口径一致，避免「按钮能点但请求必被拒」
  const canGenerate = idea.trim().length >= MIN_IDEA_LENGTH && !loading

  const [keywords, setKeywords] = useState('')
  const [brainstorming, setBrainstorming] = useState(false)
  const [candidates, setCandidates] = useState<IdeaCandidate[]>([])
  const [brainstormError, setBrainstormError] = useState<string | null>(null)
  const [showKeywordHints, setShowKeywordHints] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  /** AI 推荐的题材 id：由「联想想法」那一次调用顺带产出，角标只认它 */
  const [recommendedGenres, setRecommendedGenres] = useState<string[]>([])

  const runBrainstorm = async () => {
    const input = keywords.trim()
    if (!input || brainstorming) return
    setBrainstorming(true)
    setBrainstormError(null)
    setCandidates([])
    try {
      const data = await postJson<{ ideas: IdeaCandidate[]; genres?: string[] }>('/api/ideas', {
        keywords: input,
        genre: genre.id,
      })
      const list = Array.isArray(data.ideas) ? data.ideas : []
      setCandidates(list)
      setRecommendedGenres(Array.isArray(data.genres) ? data.genres : [])
      if (list.length === 0) setBrainstormError('没想出合适的想法，换个关键词再试试')
    } catch (error) {
      setBrainstormError(error instanceof Error ? error.message : '联想失败，请重试')
    } finally {
      setBrainstorming(false)
    }
  }

  // 题材标签不再单列「不限」：点已选中的那个即取消（回到不限）
  const [showAllGenres, setShowAllGenres] = useState(false)
  const featured = FEATURED_GENRES
    .map((id) => GENRES.find((g) => g.id === id))
    .filter((g): g is Genre => !!g)
  const restGenres = GENRES.filter((g) => g.id !== 'none' && !FEATURED_GENRES.includes(g.id))
  /*
    自动展开的两种情况：选中的题材在「更多」里、或 AI 推荐的题材在「更多」里。
    后者很关键——推荐了却不展开，用户根本看不到那颗角标，等于没推荐。
  */
  const genresExpanded =
    showAllGenres ||
    restGenres.some((g) => g.id === genre.id) ||
    restGenres.some((g) => recommendedGenres.includes(g.id))
  const genreChips = genresExpanded ? [...featured, ...restGenres] : featured
  const pickGenre = (item: Genre) => onGenreChange(item.id === genre.id ? GENRES[0] : item)

  return (
    <div className={`idea-workbench ${toolsOpen ? 'tools-open' : ''}`}>
      {/* ── 大卡：灵感输入 + 题材标签 + 生成 ── */}
      <div className="compose">
        <div className="story-command-head">
          <span className="story-command-kicker">STORY COMMAND</span>
          <button
            type="button"
            className="story-tools-toggle"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((value) => !value)}
          >
            灵感助手
          </button>
        </div>
        <label htmlFor="idea" className="sr-only">一句话故事想法</label>
        <div className="relative">
          <textarea
            id="idea"
            value={idea}
            onChange={(e) => onIdeaChange(e.target.value)}
            rows={3}
            maxLength={MAX_IDEA_LENGTH}
            placeholder="输入你的故事灵感…"
            className="ta"
          />
          {/* 字数贴着输入框右上角：它属于输入框，不属于生成按钮 */}
          <span className="pointer-events-none absolute right-0.5 top-1 text-xs tabular-nums text-ink-400">
            {idea.length} / {MAX_IDEA_LENGTH}
          </span>
        </div>

        <div className="chips mt-1.5">
          {genreChips.map((item) => {
            const active = item.id === genre.id
            const recommended = recommendedGenres.includes(item.id)
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pickGenre(item)}
                title={item.hint || '不限定题材，让 AI 自由发挥'}
                aria-pressed={active}
                className={`chip ${active ? 'lead' : ''}`}
              >
                {/* 角标只认 AI 真给过的推荐，不再无条件挂在头两个标签上 */}
                {recommended && <span className="tag-ai">AI推荐</span>}
                {item.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setShowAllGenres((v) => !v)}
            className="chip"
            title={genresExpanded ? '收起来，只留常用的六个' : '展开其余题材'}
          >
            {genresExpanded ? '收起' : '更多题材'}
          </button>
        </div>

        {/* 主操作与清空并排：两者作用于同一件事，不该一上一下各占一行 */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onGenerate} disabled={!canGenerate} className="bmain">
            {/* 按钮说的必须是它真做的事：这里调的是生成核心人物，不是大纲 */}
            {loading ? '正在生成人物…' : '生成 · 核心人物'}
            <svg className="glowstar" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 1.6c.8 5.4 4 8.6 9.4 9.4-5.4.8-8.6 4-9.4 9.4-.8-5.4-4-8.6-9.4-9.4 5.4-.8 8.6-4 9.4-9.4z" />
            </svg>
          </button>

          {hasResult && (
            <button
              type="button"
              onClick={onReset}
              disabled={loading}
              className="h-10 rounded-card border border-surface-line px-4 text-sm text-ink-600
                transition-colors hover:border-accent-300 hover:text-accent-700 disabled:opacity-50"
            >
              清空重来
            </button>
          )}
        </div>
      </div>

      {/* ── 两张小卡：示例想法 / 关键词联想 ── */}
      <div className="idea-tools">
        <p className="idea-tools-title">灵感助手</p>
        <button
          type="button"
          onClick={() => onIdeaChange(SAMPLES[Math.floor(Math.random() * SAMPLES.length)])}
          title="没灵感？换一条示例想法"
          className="mini text-left"
        >
          <span className="mtxt">
            <p>{SAMPLES[0]}</p>
            <span className="ruler" />
          </span>
          <i className="mico">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="4.4" />
              <path d="M12 8.2a2.7 2.7 0 0 1 1.7 4.8c-.6.5-1 .9-1 1.6v.3" />
              <path d="M12 17.4h.01" />
            </svg>
          </i>
        </button>

        <div className="mini">
          <span className="mtxt">
            <input
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void runBrainstorm() }
              }}
              maxLength={MAX_KEYWORD_LENGTH * 3}
              placeholder="只有关键词？比如：快递员、钥匙"
              aria-label="联想想法的关键词"
              className="w-full border-0 bg-transparent text-[14.5px] text-ink-800 placeholder:text-ink-400 focus:outline-none"
            />
            <span className="ruler" />
          </span>
          <button
            type="button"
            onClick={() => void runBrainstorm()}
            disabled={!keywords.trim() || brainstorming}
            title="让 AI 把关键词补成完整想法"
            className="mico text-[11px] font-medium text-accent-700 disabled:opacity-50"
          >
            {brainstorming ? '…' : '联想'}
          </button>
        </div>

        {!firstRun && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-expanded={showKeywordHints}
              onClick={() => setShowKeywordHints((value) => !value)}
              className="story-tools-toggle"
            >
              {showKeywordHints ? '收起常用关键词' : '常用关键词'}
            </button>
            {showKeywordHints && KEYWORD_HINTS.map((word) => (
              <button
                key={word}
                type="button"
                onClick={() => setKeywords((k) => (k.trim() ? `${k.trim()}、${word}` : word))}
                className="rounded-pill border border-dashed border-surface-line-2 px-2.5 py-1.5 text-xs text-ink-500
                  transition-colors hover:border-accent-300 hover:text-accent-600"
              >
                + {word}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="idea-followup">
        {/* ── 联想结果：AI 产出的候选，前两条标「AI推荐」 ── */}
        {candidates.length > 0 && (
          <ul className="space-y-1.5">
            {candidates.map((item, index) => (
              <li key={`${item.title}-${index}`} className="relative">
                {index < 2 && <span className="tag-ai">AI推荐</span>}
                <button
                  type="button"
                  onClick={() => onIdeaChange(item.title)}
                  className={`w-full rounded-card px-3.5 py-2.5 text-left transition-colors hover:bg-accent-50/70
                    ${index < 2 ? 'bg-accent-50/60' : 'bg-surface-soft'}`}
                >
                  <span className="block text-xs leading-relaxed text-ink-800">{item.title}</span>
                  {item.reason && <span className="mt-0.5 block text-[11px] text-ink-400">{item.reason}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        {brainstormError && <p className="text-xs text-accent-700">{brainstormError}</p>}

      </div>
    </div>
  )
}
