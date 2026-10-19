'use client'

// 放映厅（右下角）：AI 提问条 + 分镜视觉面板。
//
// 两件事都是真的：提问会带着「当前这一镜」的完整上下文去问模型，
// 回答里的改写文本可以一键写回提示词或动作；面板里的缩略图是这一镜
// 已挂的参考图（走 getPreviewUrl，本地生成 blob，像素不出门）。
import { useEffect, useRef, useState } from 'react'
import { postJson } from '@/lib/api'
import { getPreviewUrl } from '@/lib/assets/vault'
import type { Shot } from '@/lib/assets/types'
import type { Character, Genre } from '@/lib/types'
import type { AssistantReply, AssistantTarget } from '@/lib/assistant'

interface Props {
  shot: Shot | null
  idea: string
  genre: Genre
  characters: Character[]
  /** 把助手改写的文本写回当前镜头 */
  onApply: (target: Exclude<AssistantTarget, 'none'>, text: string) => void
}

/** 参考图缩略图：本地生成 blob URL，自己管生命周期 */
function ShotThumb({ vaultKey, alt }: { vaultKey: string | null; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const created = useRef<string | null>(null)

  useEffect(() => {
    setUrl(null)
    setFailed(false)
    if (!vaultKey) return
    let cancelled = false
    ;(async () => {
      const next = await getPreviewUrl(vaultKey).catch(() => null)
      if (cancelled) { if (next) URL.revokeObjectURL(next); return }
      if (next) { created.current = next; setUrl(next) } else { setFailed(true) }
    })()
    return () => {
      cancelled = true
      if (created.current) { URL.revokeObjectURL(created.current); created.current = null }
    }
  }, [vaultKey])

  // 没有参考图时，用一块 CSS 画的暗夜画面占位（和确认过的 demo 同一张）
  if (!vaultKey || failed) {
    return (
      <>
        <span className="sky" />
        <span className="rain" />
        <span className="house" />
        <span className="win" style={{ left: '24%', bottom: '48%' }} />
        <span className="win" style={{ left: '46%', bottom: '48%' }} />
        <span className="win" style={{ right: '24%', bottom: '48%' }} />
        <span className="hint">{failed ? '读不到参考图' : '还没有参考图'}</span>
      </>
    )
  }
  if (!url) return <span className="h-full w-full animate-pulse bg-white/5" />
  return <img src={url} alt={alt} loading="lazy" />
}

export default function AssistantDock({ shot, idea, genre, characters, onApply }: Props) {
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<AssistantReply | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 换了一镜就把上一条回答收起来，避免张冠李戴地应用
  useEffect(() => { setAnswer(null); setError(null) }, [shot?.id])

  const ask = async () => {
    const q = question.trim()
    if (q.length < 2 || loading) return
    setLoading(true)
    setError(null)
    setAnswer(null)
    try {
      const data = await postJson<AssistantReply>('/api/assistant', {
        question: q,
        idea,
        genre: genre.id,
        shot: shot
          ? {
              shot: shot.shot,
              scene: shot.scene,
              characters: shot.characters,
              action: shot.action,
              shotSize: shot.shotSize || '中景',
              camera: shot.camera,
              prompt: shot.prompt,
              params: shot.params,
            }
          : undefined,
        characters: characters.map((c) => ({ name: c.name, identity: c.identity, personality: c.personality })),
      })
      setAnswer(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '助手暂时没回应，稍后再试')
    } finally {
      setLoading(false)
    }
  }

  return (
    /*
      ai-surface / ai-dock 是墨层的语义标记：第四套主题下，提问条与分镜视觉
      合成一块连续的深色工具（内部用墨线分区），而不是两块分开的黑。
      其他三套主题下这两个类没有任何样式，外观不变。
    */
    <div className="ai-surface ai-dock flex min-w-0 flex-col gap-2.5">
      {/* AI 提问条 */}
      <form
        className="ask"
        onSubmit={(e) => { e.preventDefault(); void ask() }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          /*
            没有选中镜头时别承诺「润色分镜」——那时候它只能聊故事想法，
            占位文案得跟着能力走，否则用户问一句才发现它不是干这个的。
          */
          placeholder={shot ? '向 AI 提问，帮我润色分镜…' : '向 AI 提问，比如：这个开场怎么更抓人…'}
          aria-label="向 AI 提问"
        />
        <button type="submit" className="askbtn" disabled={loading || question.trim().length < 2} aria-label="发送">
          {loading ? (
            <svg viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" opacity="0.35" />
              <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19.5V5" /><path d="M5.6 11.2L12 4.8l6.4 6.4" /></svg>
          )}
        </button>
      </form>

      {(error || answer) && (
        <div className="rounded-card border border-accent-200 bg-accent-50/70 px-3.5 py-3">
          {error ? (
            <p className="text-xs leading-relaxed text-accent-800">{error}</p>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-ink-800">{answer!.reply}</p>
              {answer!.applyTarget !== 'none' && shot && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { onApply(answer!.applyTarget as Exclude<AssistantTarget, 'none'>, answer!.newText); setAnswer(null) }}
                    className="rounded-pill bg-accent-600 px-3.5 py-1.5 text-[11px] font-medium text-white
                      transition-colors hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
                  >
                    应用到{answer!.applyTarget === 'prompt' ? '本镜提示词' : '本镜动作'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnswer(null)}
                    className="rounded-pill border border-surface-line px-3 py-1.5 text-[11px] text-ink-600
                      transition-colors hover:text-ink-800"
                  >
                    先不用
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 分镜视觉 */}
      <div className="cinema">
        <div className="cin-head">
          <span className="cin-title">分镜视觉</span>
          <span className="cin-scene">{shot ? shot.scene || '未命名场景' : '还没有分镜'}</span>
          <span className="cin-no">{shot ? String(shot.shot).padStart(2, '0') : '--'}</span>
        </div>
        <div className="cin-body">
          <div className="plate">
            <ShotThumb vaultKey={shot?.refImages[0] ?? null} alt={shot ? `第 ${shot.shot} 镜参考图` : '分镜参考图'} />
          </div>
          <div className="specs">
            <div className="spec"><span className="k">镜头</span><span className="v">{shot ? String(shot.shot).padStart(2, '0') : '--'}</span></div>
            {/* 与 demo 同一组四行：镜头 / 景别 / 画幅 / 时长；运镜在镜卡里改 */}
            <div className="spec"><span className="k">景别</span><span className="v">{shot ? shot.shotSize || '中景' : '--'}</span></div>
            <div className="spec"><span className="k">画幅</span><span className="v">{shot?.params.ratio || '9:16'}</span></div>
            <div className="spec"><span className="k">时长</span><span className="v">{shot ? `${shot.params.duration}s` : '--'}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
