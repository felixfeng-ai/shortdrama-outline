'use client'

import { useEffect, useState } from 'react'

import { postJson } from '@/lib/api'
import {
  INSPIRATION_AUDIENCES,
  INSPIRATION_CONSTRAINTS,
  INSPIRATION_EMOTIONS,
  type CreativeSeed,
  type InspirationAudience,
  type InspirationConstraint,
  type InspirationEmotion,
  type InspirationRadar,
  type InspirationRadarSignal,
} from '@/lib/inspiration'
import { readGenre, type Genre } from '@/lib/types'

type OpeningMode = 'guided' | 'market'
export type CreativeLaunchPath = 'six-step' | 'agent'

interface Props {
  genre: Genre
  onApply: (seed: CreativeSeed, path: CreativeLaunchPath) => void
  allowLaunchChoice?: boolean
}

const TREND_LABELS = {
  rising: '上升',
  steady: '稳定',
  cooling: '回落',
} as const

const DIFFICULTY_LABELS = {
  low: '低',
  medium: '中',
  high: '高',
} as const

export default function IdeaOpeningAssistant({
  genre,
  onApply,
  allowLaunchChoice = false,
}: Props) {
  const [mode, setMode] = useState<OpeningMode>('guided')
  const [audience, setAudience] = useState<InspirationAudience>('unknown')
  const [emotion, setEmotion] = useState<InspirationEmotion>('unknown')
  const [constraint, setConstraint] = useState<InspirationConstraint>('balanced')
  const [keywords, setKeywords] = useState('')
  const [signalId, setSignalId] = useState('')
  const [seeds, setSeeds] = useState<CreativeSeed[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [radar, setRadar] = useState<InspirationRadar | null>(null)
  const [radarLoading, setRadarLoading] = useState(false)
  const [radarError, setRadarError] = useState('')

  useEffect(() => {
    if (mode !== 'market' || radar || radarLoading) return
    setRadarLoading(true)
    fetch('/api/inspiration/radar', { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => {
        if (!payload?.success || !payload.data?.radar) {
          throw new Error(payload?.error || '市场选题读取失败')
        }
        setRadar(payload.data.radar as InspirationRadar)
        setRadarError('')
      })
      .catch((cause) => {
        setRadarError(cause instanceof Error ? cause.message : '市场选题读取失败')
      })
      .finally(() => setRadarLoading(false))
  }, [mode, radar, radarLoading])

  async function generate(signal?: InspirationRadarSignal) {
    if (loading) return
    const nextAudience = signal?.audience ?? audience
    const nextEmotion = signal?.emotion ?? emotion
    const nextConstraint = signal
      ? signal.productionDifficulty === 'high'
        ? 'balanced'
        : 'low-cost'
      : constraint
    const nextSignalId = signal?.id ?? signalId
    setAudience(nextAudience)
    setEmotion(nextEmotion)
    setConstraint(nextConstraint)
    setSignalId(nextSignalId)
    setLoading(true)
    setError('')
    try {
      const data = await postJson<{ creativeSeeds: CreativeSeed[] }>('/api/inspiration/generate', {
        audience: nextAudience,
        emotion: nextEmotion,
        constraint: nextConstraint,
        keywords,
        genreId: genre.id,
        signalId: nextSignalId,
      })
      setSeeds(Array.isArray(data.creativeSeeds) ? data.creativeSeeds.slice(0, 3) : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '方向生成失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  function apply(seed: CreativeSeed, path: CreativeLaunchPath = 'six-step') {
    onApply(seed, path)
  }

  return (
    <section className="idea-opening" aria-label="开题助手">
      <div className="idea-opening-tabs" role="tablist" aria-label="开题方式">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'guided'}
          className={mode === 'guided' ? 'is-active' : ''}
          onClick={() => setMode('guided')}
        >
          帮我开题
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'market'}
          className={mode === 'market' ? 'is-active' : ''}
          onClick={() => setMode('market')}
        >
          市场选题
        </button>
      </div>

      {mode === 'guided' ? (
        <div className="idea-opening-guided">
          <OpeningChoice
            label="目标观众"
            choices={INSPIRATION_AUDIENCES}
            value={audience}
            onChange={setAudience}
          />
          <OpeningChoice
            label="核心情绪"
            choices={INSPIRATION_EMOTIONS}
            value={emotion}
            onChange={setEmotion}
          />
          <OpeningChoice
            label="制作约束"
            choices={INSPIRATION_CONSTRAINTS}
            value={constraint}
            onChange={setConstraint}
          />
          <label className="idea-opening-keywords">
            <span>补充关键词，可不填</span>
            <input
              value={keywords}
              maxLength={120}
              onChange={(event) => setKeywords(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault()
              }}
              placeholder="例如：旧楼、继承、律师、雨夜"
            />
          </label>
          <div className="idea-opening-submit">
            <span>一次消耗 1 单位创作额度</span>
            <button type="button" disabled={loading} onClick={() => void generate()}>
              {loading ? '正在开题' : '生成三个方向'}
            </button>
          </div>
        </div>
      ) : (
        <div className="idea-opening-market">
          <div className="idea-opening-market-head">
            <span>{radar?.disclaimer ?? '正在读取公开创作风向样本'}</span>
            {radar && <small>快照 {radar.capturedAt}</small>}
          </div>
          {radarLoading ? (
            <p className="idea-opening-empty">正在读取市场选题...</p>
          ) : radarError ? (
            <p className="idea-opening-error">{radarError}</p>
          ) : radar?.signals.map((signal) => (
            <article key={signal.id} className="idea-opening-signal">
              <header>
                <div>
                  <b>{signal.name}</b>
                  <p>{signal.summary}</p>
                </div>
                <span className={`idea-opening-trend is-${signal.trend}`}>
                  {TREND_LABELS[signal.trend]}
                </span>
              </header>
              <p className="idea-opening-structure">{signal.structure}</p>
              <footer>
                <span>拥挤度 {DIFFICULTY_LABELS[signal.crowding]}</span>
                <span>制作难度 {DIFFICULTY_LABELS[signal.productionDifficulty]}</span>
                <span>合规风险 {DIFFICULTY_LABELS[signal.complianceRisk]}</span>
                <a href={signal.sourceUrl} target="_blank" rel="noreferrer">来源</a>
                <button type="button" disabled={loading} onClick={() => void generate(signal)}>
                  用这个方向
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      {error && <p className="idea-opening-error" role="alert">{error}</p>}

      {seeds.length > 0 && (
        <div className="idea-opening-results">
          <header>
            <b>三个可拍方向</b>
            <span>选择后会把故事写入上方输入框，不会自动消耗下一步额度。</span>
          </header>
          <div className="idea-opening-seeds">
            {seeds.map((seed, index) => (
              <article key={`${seed.logline}-${index}`} className="idea-opening-seed">
                <header>
                  <span>方向 {String(index + 1).padStart(2, '0')}</span>
                  <b>{seed.title}</b>
                </header>
                <p className="idea-opening-logline">{seed.logline}</p>
                <div className="idea-opening-hook">
                  <span>3 秒钩子</span>
                  <p>{seed.hook3s}</p>
                </div>
                <div className="idea-opening-facts">
                  <span>{seed.audienceLabel}</span>
                  <span>{readGenre(seed.genreId).label}</span>
                  <span>{seed.castCount} 角色</span>
                  <span>{seed.locationCount} 场景</span>
                  <span>难度 {DIFFICULTY_LABELS[seed.difficulty]}</span>
                  <span>成本 {DIFFICULTY_LABELS[seed.costBand]}</span>
                </div>
                <p className="idea-opening-risk">风险：{seed.risk}</p>
                <details className="idea-opening-details">
                  <summary>查看创作判断依据</summary>
                  <dl>
                    <div><dt>核心冲突</dt><dd>{seed.conflict}</dd></div>
                    <div><dt>情绪落点</dt><dd>{seed.emotionalPayoff}</dd></div>
                    <div><dt>差异点</dt><dd>{seed.differentiation}</dd></div>
                  </dl>
                </details>
                {allowLaunchChoice ? (
                  <div className="idea-opening-launch">
                    <button type="button" onClick={() => apply(seed, 'six-step')}>
                      六步制作
                    </button>
                    <button
                      type="button"
                      className="is-secondary"
                      onClick={() => apply(seed, 'agent')}
                    >
                      交给 Agent
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => apply(seed)}>使用这个方向</button>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function OpeningChoice<T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string
  choices: Array<{ id: T; label: string; hint: string }>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="idea-opening-choice">
      <span>{label}</span>
      <div>
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            title={choice.hint}
            className={value === choice.id ? 'is-active' : ''}
            aria-pressed={value === choice.id}
            onClick={() => onChange(choice.id)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  )
}
