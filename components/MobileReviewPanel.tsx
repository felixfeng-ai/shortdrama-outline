'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { Shot, VisualCharacter } from '@/lib/assets/types'
import {
  fetchProjectGenerationAssets,
  selectKeyframe,
} from '@/lib/generation/client'
import { keyframeExportName } from '@/lib/generation/export'
import { buildReviewGroups, type ReviewGroup } from '@/lib/generation/review'
import type { GeneratedAsset } from '@/lib/generation/types'

interface Props {
  projectId: string | null
  visuals: VisualCharacter[]
  shots: Shot[]
}

function when(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export default function MobileReviewPanel({ projectId, visuals, shots }: Props) {
  const [assets, setAssets] = useState<GeneratedAsset[]>([])
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!projectId) {
      setAssets([])
      setOpenKey(null)
      return
    }
    let cancelled = false
    const load = () => {
      fetchProjectGenerationAssets(projectId)
        .then((state) => {
          if (!cancelled) setAssets(state.assets)
        })
        .catch(() => {
          if (!cancelled) setAssets([])
        })
    }
    load()
    window.addEventListener('chengju:generation-updated', load)
    return () => {
      cancelled = true
      window.removeEventListener('chengju:generation-updated', load)
    }
  }, [projectId])

  const groups = useMemo(() => buildReviewGroups(assets, visuals, shots), [assets, visuals, shots])
  const openGroup = groups.find((group) => group.key === openKey) ?? null
  const activeAsset = openGroup?.assets.find((asset) => asset.id === activeId) ?? openGroup?.assets[0] ?? null

  useEffect(() => {
    if (!openKey) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReview()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [openKey])

  function openReview(group: ReviewGroup, trigger: HTMLElement) {
    returnFocusRef.current = trigger
    setError(null)
    setOpenKey(group.key)
    setActiveId(group.assets.find((asset) => asset.selectedAt)?.id ?? group.assets[0]?.id ?? null)
  }

  function closeReview() {
    setOpenKey(null)
    window.requestAnimationFrame(() => returnFocusRef.current?.focus())
  }

  function showVersion(asset: GeneratedAsset) {
    setActiveId(asset.id)
    document.getElementById(`mobile-review-version-${asset.id}`)?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    })
  }

  async function adoptActive() {
    if (!projectId || !openGroup || !activeAsset || activeAsset.selectedAt || selecting) return
    setSelecting(true)
    setError(null)
    try {
      const next = await selectKeyframe(projectId, activeAsset.id)
      setAssets((current) => current.map((asset) => {
        if (asset.targetType !== next.targetType || asset.targetId !== next.targetId) return asset
        return { ...asset, selectedAt: asset.id === next.id ? next.selectedAt : null }
      }))
      window.dispatchEvent(new CustomEvent('chengju:generation-updated'))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '采用关键帧失败')
    } finally {
      setSelecting(false)
    }
  }

  if (groups.length === 0) return null

  return (
    <>
      <section className="mobile-review" aria-labelledby="mobile-review-heading">
        <div className="mobile-review-head">
          <div>
            <p>KEYFRAMES</p>
            <h2 id="mobile-review-heading">待审关键帧</h2>
          </div>
          <span>{groups.length} 组</span>
        </div>
        <div className="mobile-review-rail">
          {groups.slice(0, 8).map((group) => {
            const selected = group.assets.find((asset) => asset.selectedAt)
            const latest = group.assets[0]
            return (
              <button
                key={group.key}
                type="button"
                className="mobile-review-card min-h-11"
                onClick={(event) => openReview(group, event.currentTarget)}
                aria-label={`查看${group.title}的${group.assets.length}个版本`}
              >
                <img src={latest.downloadUrl} alt="" loading="lazy" />
                <span className="mobile-review-card-copy">
                  <b>{group.title}</b>
                  <small>{group.assets.length} 版 · {selected ? '已采用' : '待审'}</small>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {mounted && openGroup && activeAsset && createPortal(
        <div className="mobile-review-overlay" role="dialog" aria-modal="true" aria-labelledby="mobile-review-title">
          <header className="mobile-review-overlay-head">
            <div>
              <p>{openGroup.subtitle}</p>
              <h2 id="mobile-review-title">{openGroup.title}</h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              className="min-h-11 min-w-11"
              onClick={closeReview}
              aria-label="关闭审片"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div className="mobile-review-stage">
            <div className="mobile-review-versions scroll-snap-x">
              {openGroup.assets.map((asset, index) => (
                <figure
                  key={asset.id}
                  id={`mobile-review-version-${asset.id}`}
                  className={asset.id === activeAsset.id ? 'is-active' : ''}
                  onClick={() => showVersion(asset)}
                >
                  <img
                    src={asset.downloadUrl}
                    alt={`${openGroup.title}版本 ${index + 1}`}
                    loading={index === 0 ? 'eager' : 'lazy'}
                  />
                  <figcaption>
                    <span>V{openGroup.assets.length - index}</span>
                    <span>{asset.selectedAt ? '当前采用' : when(asset.createdAt)}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>

          <div className="mobile-review-thumbs" aria-label="版本列表">
            {openGroup.assets.map((asset, index) => (
              <button
                key={asset.id}
                type="button"
                className={asset.id === activeAsset.id ? 'is-active' : ''}
                onClick={() => showVersion(asset)}
                aria-label={`查看版本 ${index + 1}${asset.selectedAt ? '，当前采用' : ''}`}
                aria-current={asset.id === activeAsset.id ? 'true' : undefined}
              >
                <img src={asset.downloadUrl} alt="" loading="lazy" />
                {asset.selectedAt && <span aria-hidden="true" />}
              </button>
            ))}
          </div>

          <footer className="mobile-review-footer">
            <div className="mobile-review-meta" aria-live="polite">
              <b>{activeAsset.selectedAt ? '当前采用' : '候选版本'}</b>
              <span>{activeAsset.model} · {(activeAsset.bytes / 1024).toFixed(0)} KB</span>
            </div>
            <div className="mobile-review-actions">
              <a
                href={activeAsset.downloadUrl}
                download={keyframeExportName(activeAsset)}
                className="min-h-11"
              >
                下载
              </a>
              <button
                type="button"
                className="min-h-11"
                disabled={Boolean(activeAsset.selectedAt) || selecting}
                onClick={() => void adoptActive()}
              >
                {activeAsset.selectedAt ? '当前采用' : selecting ? '采用中…' : '采用此版'}
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </footer>
        </div>,
        document.body,
      )}
    </>
  )
}
