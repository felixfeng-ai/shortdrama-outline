'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import VeyaBrandMark from './VeyaBrandMark'
import {
  fetchDeliveryReview,
  submitReviewDecision,
  submitReviewFeedback,
  type DeliveryReviewClient,
} from '@/lib/delivery/client'

function timeLabel(value: unknown): string {
  const ms = Math.max(0, Number(value) || 0)
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1_000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function ReviewRoom({ token }: { token: string }) {
  const [review, setReview] = useState<DeliveryReviewClient | null>(null)
  const [episodeIndex, setEpisodeIndex] = useState(0)
  const [timestampMs, setTimestampMs] = useState(0)
  const [feedback, setFeedback] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const currentItem = review?.items[episodeIndex]
  const currentFeedback = useMemo(() => {
    if (!review || !currentItem) return []
    return review.feedback.filter((item) => item.itemId === currentItem.id)
  }, [currentItem, review])
  const latestDecision = review?.decisions[0]

  useEffect(() => {
    void fetchDeliveryReview(token)
      .then((data) => {
        setReview(data)
        setError('')
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : '审片内容读取失败')
      })
      .finally(() => setLoading(false))
  }, [token])

  async function addComment() {
    if (!currentItem || !feedback.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      await submitReviewFeedback({
        token,
        itemId: currentItem.id,
        timestampMs,
        body: feedback.trim(),
      })
      const refreshed = await fetchDeliveryReview(token)
      setReview(refreshed)
      setFeedback('')
      setNotice(`已在 ${timeLabel(timestampMs)} 添加批注。`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '批注保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function submitDecision(decision: 'approved' | 'changes_requested') {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await submitReviewDecision({ token, decision, note: decisionNote.trim() })
      const refreshed = await fetchDeliveryReview(token)
      setReview(refreshed)
      setNotice(decision === 'approved' ? '已提交审核通过。' : '已退回修改并保留批注。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '审核结论提交失败')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <main className="delivery-shell"><p className="delivery-empty">正在打开审片链接…</p></main>
  }

  if (!review) {
    return (
      <main className="delivery-shell">
        <header className="delivery-topbar">
          <a href="/" className="delivery-brand">
            <span><VeyaBrandMark /></span>
            <b>VeyaTV</b>
            <em>审片</em>
          </a>
        </header>
        <section className="delivery-review-invalid">
          <h1>审片链接不可用</h1>
          <p>{error || '链接可能已过期或被撤销。'}</p>
        </section>
      </main>
    )
  }

  const packageTitle = String(review.package.title ?? '成片审片')
  return (
    <main className="delivery-shell review-shell">
      <header className="delivery-topbar">
        <a href="/" className="delivery-brand">
          <span><VeyaBrandMark /></span>
          <b>VeyaTV</b>
          <em>审片</em>
        </a>
        <div className="review-identity">
          <b>{review.reviewer.name}</b>
          <span>{review.reviewer.roleLabel}</span>
        </div>
      </header>

      <section className="review-heading">
        <div>
          <p>REVIEW ROOM</p>
          <h1>{packageTitle}</h1>
          <span>
            链接有效期至 {new Intl.DateTimeFormat('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(review.reviewer.expiresAt))}
          </span>
        </div>
        <span className={`delivery-status is-${String(review.package.reviewStatus ?? 'pending')}`}>
          {review.package.reviewStatus === 'approved'
            ? '已通过'
            : review.package.reviewStatus === 'changes_requested'
              ? '退回修改'
              : '待审核'}
        </span>
      </section>

      {error && <p className="delivery-alert is-error" role="alert">{error}</p>}
      {notice && <p className="delivery-alert is-success" role="status">{notice}</p>}

      <section className="review-player">
        <video
          ref={videoRef}
          controls
          preload="metadata"
          src={currentItem?.publishVideoUrl}
          onTimeUpdate={(event) => setTimestampMs(Math.floor(event.currentTarget.currentTime * 1_000))}
        />
        <div>
          <div className="review-episode-tabs">
            {review.items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={index === episodeIndex ? 'is-active' : ''}
                onClick={() => {
                  setEpisodeIndex(index)
                  setTimestampMs(0)
                }}
              >
                {item.episodeCode}
              </button>
            ))}
          </div>
          <h2>{currentItem?.episodeCode ?? 'EPISODE'}</h2>
          <p>{String(currentItem?.metadata.description ?? '当前交付版本')}</p>
          <div className="review-current-time">
            <span>当前批注时间</span>
            <b>{timeLabel(timestampMs)}</b>
            <button type="button" onClick={() => {
              if (videoRef.current) setTimestampMs(Math.floor(videoRef.current.currentTime * 1_000))
            }}>
              取当前播放时间
            </button>
          </div>
        </div>
      </section>

      <section className="review-feedback">
        <header>
          <div>
            <span>时间点批注</span>
            <h2>把问题说在具体画面上</h2>
          </div>
          <b>{currentFeedback.length}</b>
        </header>
        <div className="review-comment-compose">
          <textarea
            aria-label="审片批注"
            placeholder={`在 ${timeLabel(timestampMs)} 写下需要修改的内容`}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <button type="button" disabled={busy || !feedback.trim()} onClick={() => void addComment()}>
            {busy ? '保存中…' : '添加时间点批注'}
          </button>
        </div>
        <div className="review-comment-list">
          {currentFeedback.length === 0 ? (
            <p>这一集还没有批注。</p>
          ) : currentFeedback.map((item) => (
            <article key={String(item.id)}>
              <button type="button" onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = Number(item.timestampMs) / 1_000
              }}>
                {timeLabel(item.timestampMs)}
              </button>
              <p>{String(item.body ?? '')}</p>
              <span>{String(item.status ?? 'open') === 'open' ? '待处理' : '已处理'}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="review-decision">
        <div>
          <span>审核结论</span>
          <h2>{latestDecision ? '可以更新结论' : '完成后提交结论'}</h2>
          <p>退回修改不会删除交付包，批注和结论都会保留。</p>
        </div>
        <textarea
          aria-label="审核备注"
          placeholder="补充整体意见，可选"
          value={decisionNote}
          onChange={(event) => setDecisionNote(event.target.value)}
        />
        <div>
          <button type="button" className="is-secondary" disabled={busy} onClick={() => void submitDecision('changes_requested')}>
            退回修改
          </button>
          <button type="button" disabled={busy} onClick={() => void submitDecision('approved')}>
            审核通过
          </button>
        </div>
      </section>
    </main>
  )
}
