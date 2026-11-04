'use client'

import { useEffect, useState } from 'react'
import {
  listReusableAssets,
  saveReusableAsset,
} from '@/lib/assets/api'
import type {
  ReusableAsset,
  ReusableAssetType,
} from '@/lib/assets/library'

export interface AssetLibrarySource {
  key: string
  assetType: ReusableAssetType
  name: string
  sourceAssetId?: string
  content: Record<string, unknown>
}

interface Props {
  projectId: string | null
  sources: AssetLibrarySource[]
  onReuse: (asset: ReusableAsset) => void
}

const TYPE_LABEL: Record<ReusableAssetType, string> = {
  character: '角色',
  place: '地点',
  look: '视觉宪法',
}

export default function AssetLibraryPanel({ projectId, sources, onReuse }: Props) {
  const [assets, setAssets] = useState<ReusableAsset[]>([])
  const [sourceKey, setSourceKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listReusableAssets()
      .then((items) => {
        if (active) setAssets(items)
      })
      .catch(() => {
        if (active) setNotice('资产库暂时读取不到')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!sources.some((source) => source.key === sourceKey)) {
      setSourceKey(sources[0]?.key ?? '')
    }
  }, [sourceKey, sources])

  async function saveSelected() {
    const source = sources.find((item) => item.key === sourceKey)
    if (!projectId || !source || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const asset = await saveReusableAsset({
        projectId,
        assetType: source.assetType,
        name: source.name,
        sourceAssetId: source.sourceAssetId,
        content: source.content,
      })
      setAssets((current) => [
        asset,
        ...current.filter((item) => item.id !== asset.id),
      ])
      setNotice(`已存入资产库：${asset.name} · v${asset.version}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '资产保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-panel border border-surface-line bg-surface-raised px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold text-ink-800">跨项目资产库</h3>
          <p className="mt-0.5 text-[9.5px] leading-relaxed text-ink-400">
            只跨项目复用文本与设定，不带走本地图片。
          </p>
        </div>
        <span className="shrink-0 font-mono text-[9px] text-ink-400">{assets.length} 项</span>
      </div>

      <div className="mt-3 grid gap-1.5">
        <span className="text-[9px] text-ink-400">存入当前项目的资产</span>
        <div className="flex gap-2">
          <select
            value={sourceKey}
            onChange={(event) => setSourceKey(event.target.value)}
            disabled={!projectId || sources.length === 0}
            className="min-h-9 min-w-0 flex-1 rounded-chip border border-surface-line bg-surface-base px-2.5 text-[10px] text-ink-700 outline-none focus:border-accent-300 disabled:opacity-45"
          >
            {sources.length === 0 && <option value="">暂无可保存资产</option>}
            {sources.map((source) => (
              <option key={source.key} value={source.key}>
                {TYPE_LABEL[source.assetType]} · {source.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!projectId || !sourceKey || busy}
            onClick={() => void saveSelected()}
            className="min-h-9 shrink-0 rounded-chip border border-accent-300 px-3 text-[9.5px] text-accent-700 disabled:cursor-wait disabled:opacity-45"
          >
            {busy ? '保存中…' : '存入'}
          </button>
        </div>
      </div>

      <p className="mt-2 min-h-4 text-[9px] text-ink-400" role="status" aria-live="polite">
        {notice || (projectId ? '同名资产再次保存会递增版本' : '请先保存项目')}
      </p>

      {assets.length > 0 && (
        <div className="mt-2 border-t border-surface-line pt-1">
          {assets.slice(0, 10).map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between gap-2 border-b border-surface-line/70 py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate text-[10px] text-ink-700">{asset.name}</p>
                <p className="mt-0.5 text-[8.5px] text-ink-400">
                  {TYPE_LABEL[asset.assetType]} · v{asset.version}
                </p>
              </div>
              <button
                type="button"
                disabled={!projectId}
                onClick={() => {
                  onReuse(asset)
                  setNotice(`已复用：${asset.name}`)
                }}
                className="shrink-0 rounded-chip border border-surface-line px-2 py-1 text-[9px] text-ink-500 disabled:opacity-45"
              >
                复用到项目
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
