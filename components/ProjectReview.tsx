'use client'

import { useEffect, useState, type ReactNode } from 'react'

import type { ProjectShareReview } from '@/lib/assets/shares'

const SECTIONS = [
  ['idea', '故事'],
  ['characters', '人物'],
  ['acts', '三幕'],
  ['episodes', '分集'],
  ['visuals', '定妆'],
  ['scenes', '场次'],
  ['shots', '分镜'],
] as const

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : []
}

function shortDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(timestamp)
}

function ReviewSection({
  id,
  title,
  summary,
  children,
}: {
  id: string
  title: string
  summary: string
  children: ReactNode
}) {
  return (
    <section id={id} className="review-section">
      <header>
        <h2>{title}</h2>
        <p>{summary}</p>
      </header>
      <div className="review-section-body">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="review-empty">{children}</p>
}

export default function ProjectReview({ token }: { token: string }) {
  const [review, setReview] = useState<ProjectShareReview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/share/${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok || !body?.success) throw new Error(body?.error || '审阅链接已失效')
        return body.data.review as ProjectShareReview
      })
      .then((data) => {
        if (!cancelled) setReview(data)
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '审阅链接已失效')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [token])

  const characters = list(review?.characters)
  const acts = list(review?.acts)
  const episodes = list(review?.episodes)
  const visuals = list(review?.visuals)
  const scenes = list(review?.scenes)
  const places = list(review?.places)
  const shots = list(review?.shots)

  return (
    <main className="review-page">
      <header className="review-topbar">
        <a className="review-brand" href="/">
          <span aria-hidden="true">V</span>
          <b>VeyaFrame</b>
          <em>成剧</em>
        </a>
        <div className="review-badge">
          <i aria-hidden="true" />
          只读审阅
        </div>
      </header>

      {loading ? (
        <div className="review-state" aria-live="polite">
          <p>正在打开项目审阅…</p>
        </div>
      ) : error || !review ? (
        <div className="review-state review-state-error">
          <p className="review-state-code">LINK UNAVAILABLE</p>
          <h1>这份审阅链接已失效</h1>
          <p>{error || '链接可能已过期，或项目所有者重新生成了新的审阅链接。'}</p>
          <a href="/">返回成剧</a>
        </div>
      ) : (
        <>
          <section className="review-hero">
            <div>
              <p className="review-kicker">PROJECT REVIEW / READ ONLY</p>
              <h1>{review.title}</h1>
              <p className="review-summary">
                {review.idea?.idea || '项目所有者尚未填写故事想法。'}
              </p>
            </div>
            <dl className="review-meta">
              <div>
                <dt>更新</dt>
                <dd>{shortDate(review.updatedAt)}</dd>
              </div>
              <div>
                <dt>链接有效至</dt>
                <dd>{shortDate(review.expiresAt)}</dd>
              </div>
              <div>
                <dt>内容</dt>
                <dd>六步创作产物</dd>
              </div>
            </dl>
          </section>

          <div className="review-layout">
            <nav className="review-nav" aria-label="审阅目录">
              <p>DIRECTORY</p>
              {SECTIONS.map(([id, label], index) => (
                <a key={id} href={`#${id}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {label}
                </a>
              ))}
            </nav>

            <article className="review-article">
              <ReviewSection id="idea" title="故事" summary="这一版审阅所依据的原始想法与类型。">
                {review.idea?.idea ? (
                  <div className="review-prose">
                    <p>{review.idea.idea}</p>
                    {review.idea.genre ? <small>类型：{review.idea.genre}</small> : null}
                  </div>
                ) : <Empty>这一版还没有故事输入。</Empty>}
              </ReviewSection>

              <ReviewSection id="characters" title="核心人物" summary="动机、性格与人物弧光决定下游剧情是否成立。">
                {characters.length === 0 ? <Empty>还没有核心人物。</Empty> : (
                  <div className="review-rows">
                    {characters.map((character, index) => (
                      <div key={text(character.id) || index}>
                        <h3>{text(character.name) || `人物 ${index + 1}`}</h3>
                        <dl>
                          <div><dt>身份</dt><dd>{text(character.identity) || '—'}</dd></div>
                          <div><dt>性格</dt><dd>{text(character.personality) || '—'}</dd></div>
                          <div><dt>动机</dt><dd>{text(character.motivation) || '—'}</dd></div>
                          <div><dt>弧光</dt><dd>{text(character.arc) || '—'}</dd></div>
                        </dl>
                      </div>
                    ))}
                  </div>
                )}
              </ReviewSection>

              <ReviewSection id="acts" title="三幕结构" summary="查看冲突如何升级，以及每一幕是否完成自己的叙事职责。">
                {acts.length === 0 ? <Empty>还没有三幕大纲。</Empty> : (
                  <div className="review-chapters">
                    {acts.map((act, index) => (
                      <div key={index}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <h3>{text(act.title) || text(act.name) || `第 ${index + 1} 幕`}</h3>
                        <p>{text(act.summary) || text(act.synopsis) || '—'}</p>
                        {Array.isArray(act.points) && act.points.length > 0 ? (
                          <ul>{act.points.map((point, pointIndex) => (
                            <li key={pointIndex}>{text(point) || JSON.stringify(point)}</li>
                          ))}</ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </ReviewSection>

              <ReviewSection id="episodes" title="分集剧情" summary="逐集检查冲突推进和结尾钩子，不只看集数。">
                {episodes.length === 0 ? <Empty>还没有分集剧情。</Empty> : (
                  <div className="review-episodes">
                    {episodes.map((episode, index) => (
                      <div key={index}>
                        <span>第 {Number(episode.number) || index + 1} 集</span>
                        <h3>{text(episode.title) || '未命名'}</h3>
                        <p>{text(episode.synopsis) || '—'}</p>
                        {text(episode.hook) ? <blockquote>钩子：{text(episode.hook)}</blockquote> : null}
                      </div>
                    ))}
                  </div>
                )}
              </ReviewSection>

              <ReviewSection id="visuals" title="视觉定妆" summary="角色外观锚点决定跨镜头一致性。">
                {visuals.length === 0 ? <Empty>还没有视觉定妆。</Empty> : (
                  <div className="review-rows">
                    {visuals.map((visual, index) => (
                      <div key={text(visual.entityId) || index}>
                        <h3>{text(visual.name) || `角色 ${index + 1}`}</h3>
                        <dl>
                          <div><dt>年龄</dt><dd>{text(visual.age) || '—'}</dd></div>
                          <div><dt>脸型</dt><dd>{text(visual.face) || '—'}</dd></div>
                          <div><dt>发型</dt><dd>{text(visual.hair) || '—'}</dd></div>
                          <div><dt>辨识特征</dt><dd>{text(visual.feature) || '—'}</dd></div>
                        </dl>
                        {text(visual.anchor) ? <pre>{text(visual.anchor)}</pre> : null}
                      </div>
                    ))}
                  </div>
                )}
              </ReviewSection>

              <ReviewSection id="scenes" title="场次与地点" summary="场次定义连续时空，地点锚点约束同一空间的视觉一致性。">
                {scenes.length === 0 && places.length === 0 ? <Empty>还没有场次与地点。</Empty> : (
                  <>
                    {places.length > 0 ? (
                      <div className="review-compact-list">
                        <h3>地点锚点</h3>
                        {places.map((place, index) => (
                          <div key={index}>
                            <b>{text(place.name) || `地点 ${index + 1}`}</b>
                            <span>{text(place.anchor) || [text(place.space), text(place.lighting)].filter(Boolean).join(' · ') || '—'}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {scenes.length > 0 ? (
                      <div className="review-episodes">
                        {scenes.map((scene, index) => (
                          <div key={index}>
                            <span>场 {Number(scene.number) || index + 1}</span>
                            <h3>{text(scene.location) || '未命名场景'}</h3>
                            <p>{text(scene.summary) || text(scene.synopsis) || text(scene.action) || '—'}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </ReviewSection>

              <ReviewSection id="shots" title="分镜" summary="逐镜检查画面、运镜、参考图与台词，提示词可直接交给出图工具。">
                {shots.length === 0 ? <Empty>还没有分镜。</Empty> : (
                  <div className="review-shots">
                    {shots.map((shot, index) => (
                      <div key={text(shot.id) || index}>
                        <header>
                          <span>
                            {Number(shot.episode) > 0 ? `第 ${Number(shot.episode)} 集 · ` : ''}
                            镜 {Number(shot.shot) || index + 1}
                          </span>
                          <b>{text(shot.scene) || '未命名场景'}</b>
                        </header>
                        <dl>
                          <div><dt>景别</dt><dd>{text(shot.shotSize) || '—'}</dd></div>
                          <div><dt>运镜</dt><dd>{text(shot.camera) || '—'}</dd></div>
                          <div><dt>时长</dt><dd>{Number((shot.params as Record<string, unknown> | undefined)?.duration) || 10} 秒</dd></div>
                          <div><dt>参考图</dt><dd>{Array.isArray(shot.refImages) && shot.refImages.length > 0 ? shot.refImages.map(text).join('、') : '无'}</dd></div>
                        </dl>
                        {text(shot.dialogue) ? (
                          <blockquote>{text(shot.speaker) ? `${text(shot.speaker)}：` : ''}{text(shot.dialogue)}</blockquote>
                        ) : null}
                        <pre>{text(shot.prompt) || text(shot.action) || '—'}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </ReviewSection>
            </article>
          </div>
        </>
      )}
    </main>
  )
}
