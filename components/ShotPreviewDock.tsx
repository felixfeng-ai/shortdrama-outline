'use client'

import { useEffect, useRef, useState } from 'react'
import { getPreviewUrl } from '@/lib/assets/vault'
import type { Shot } from '@/lib/assets/types'
import { fetchProjectGenerationAssets } from '@/lib/generation/client'
import type { GeneratedAsset } from '@/lib/generation/types'

interface Props {
  projectId: string | null
  shot: Shot | null
}

function LocalReference({
  vaultKey,
  alt,
  shotNumber,
}: {
  vaultKey: string | null
  alt: string
  shotNumber: number | null
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const created = useRef<string | null>(null)

  useEffect(() => {
    setUrl(null)
    setFailed(false)
    if (!vaultKey) return
    let cancelled = false
    void getPreviewUrl(vaultKey).then((next) => {
      if (cancelled) {
        if (next) URL.revokeObjectURL(next)
        return
      }
      if (next) {
        created.current = next
        setUrl(next)
      } else {
        setFailed(true)
      }
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })
    return () => {
      cancelled = true
      if (created.current) {
        URL.revokeObjectURL(created.current)
        created.current = null
      }
    }
  }, [vaultKey])

  const empty = (message: string) => (
    <div className="shot-preview-empty">
      <b>{shotNumber ? String(shotNumber).padStart(2, '0') : '--'}</b>
      <span>{message}</span>
    </div>
  )
  if (!vaultKey) return empty('尚未生成镜头画面')
  if (failed) return empty('本地参考图不可用')
  if (!url) return <span className="shot-preview-loading">读取参考图…</span>
  return <img src={url} alt={alt} loading="lazy" />
}

function statusLabel(shot: Shot | null): string {
  if (!shot) return '无镜头'
  if (shot.status === 'done') return '已完成'
  if (shot.status === 'rework') return '需返修'
  return '待处理'
}

export default function ShotPreviewDock({ projectId, shot }: Props) {
  const [assets, setAssets] = useState<GeneratedAsset[]>([])

  useEffect(() => {
    if (!projectId || !shot) {
      setAssets([])
      return
    }
    let active = true
    const load = () => {
      void fetchProjectGenerationAssets(projectId).then((state) => {
        if (active) setAssets(state.assets)
      }).catch(() => {
        if (active) setAssets([])
      })
    }
    load()
    window.addEventListener('chengju:generation-updated', load)
    return () => {
      active = false
      window.removeEventListener('chengju:generation-updated', load)
    }
  }, [projectId, shot?.entityId])

  const selectedAssets = shot
    ? assets.filter((asset) =>
      asset.targetType === 'shot'
      && asset.targetId === shot.entityId
      && asset.selectedAt
    ).sort((left, right) => right.createdAt - left.createdAt)
    : []
  const selectedVideo = selectedAssets.find((asset) => asset.mediaKind === 'video')
  const selectedImage = selectedAssets.find((asset) => asset.mediaKind === 'image')
  const localReference = shot?.refImages[0] ?? null

  return (
    <div className="shot-preview-dock">
      <header className="shot-preview-head">
        <div>
          <span>SHOT PREVIEW</span>
          <h2>{shot ? `第 ${shot.shot} 镜` : '当前镜头'}</h2>
          <p>{shot?.scene || '还没有可预览镜头'}</p>
        </div>
        <em className={`shot-preview-status ${shot?.status ?? 'todo'}`}>{statusLabel(shot)}</em>
      </header>

      <div className="shot-preview-visual">
        {selectedVideo ? (
          <video
            src={selectedVideo.downloadUrl}
            controls
            playsInline
            preload="metadata"
            aria-label={`第 ${shot?.shot ?? ''} 镜已采用视频`}
          />
        ) : selectedImage ? (
          <img src={selectedImage.downloadUrl} alt={`第 ${shot?.shot ?? ''} 镜已采用关键帧`} loading="lazy" />
        ) : shot ? (
          <LocalReference
            vaultKey={localReference}
            alt={`第 ${shot.shot} 镜本地参考图`}
            shotNumber={shot.shot}
          />
        ) : null}
        {!selectedVideo && !selectedImage && !shot && (
          <div className="shot-preview-empty">
            <b>--</b>
            <span>尚未生成镜头画面</span>
          </div>
        )}
        <span className="shot-preview-source">
          {selectedVideo
            ? '已采用视频'
            : selectedImage
              ? '已采用关键帧'
              : localReference
                ? '本地参考图'
                : '待出图'}
        </span>
      </div>

      <dl className="shot-preview-specs">
        <div><dt>景别</dt><dd>{shot?.shotSize || '--'}</dd></div>
        <div><dt>画幅</dt><dd>{shot?.params.ratio || '--'}</dd></div>
        <div><dt>时长</dt><dd>{shot ? `${shot.params.duration}s` : '--'}</dd></div>
        <div><dt>镜号</dt><dd>{shot ? String(shot.shot).padStart(2, '0') : '--'}</dd></div>
      </dl>

      <section className="shot-preview-narrative">
        <div>
          <span>画面动作</span>
          <p>{shot?.action || '这一镜还没有画面动作。'}</p>
        </div>
        <div>
          <span>台词</span>
          <p>{shot?.dialogue ? `${shot.speaker ? `${shot.speaker}：` : ''}${shot.dialogue}` : '这一镜暂无台词。'}</p>
        </div>
      </section>
    </div>
  )
}
