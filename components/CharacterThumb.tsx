'use client'

// 角色视觉缩略图：把本地图库里匹配到的图直接显示在角色卡片上。
//
// 为什么需要它：在此之前「自动挂接」只是个后台动作——用户扫完文件夹，
// 界面上什么都看不到，只能靠文字猜「到底挂上了没、挂的是哪张」。
// 图挂上了却不显示，等于没挂：定妆这一步的全部意义就是「让人一眼认出这个角色」。
//
// 像素仍然不出门：走 getPreviewUrl（fs-access 从授权目录读 / indexeddb 从本地库取），
// 拿到的是浏览器本地生成的 blob URL。
import { useEffect, useRef, useState } from 'react'
import { getPreviewUrl } from '@/lib/assets/vault'

interface Props {
  keys: string[]
  /** 角色名，用于 alt 与无障碍标签 */
  name: string
  /** 最多显示几张（默认 1，卡片里只留主图） */
  max?: number
  /** 已知的命中方式说明，如「拼音」，显示成角标 */
  matchNote?: string
  className?: string
}

/** 一张图的预览（自己管 blob URL 的生命周期） */
function Preview({ vaultKey, alt }: { vaultKey: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const created = useRef<string | null>(null)

  useEffect(() => {
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

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-deep px-1 text-center text-[10px] leading-tight text-ink-400">
        读不到图
      </div>
    )
  }
  if (!url) {
    return <div className="h-full w-full animate-pulse bg-surface-deep" />
  }
  return <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" />
}

export default function CharacterThumb({ keys, name, max = 1, matchNote, className = '' }: Props) {
  if (keys.length === 0) return null
  const shown = keys.slice(0, max)

  return (
    <div className={`relative shrink-0 overflow-hidden rounded-chip border border-surface-line bg-surface-deep ${className}`}>
      {shown.map((k) => (
        <div key={k} className="h-full w-full" title={k}>
          <Preview vaultKey={k} alt={`${name} 的视觉参考图`} />
        </div>
      ))}

      {matchNote && (
        <span
          className="absolute bottom-1 right-1 rounded-chip bg-ink-900/72 px-1 py-0.5 text-[9px] font-medium text-surface backdrop-blur-sm"
          title="这张图是靠这个名字线索自动匹配上的"
        >
          {matchNote}
        </span>
      )}

      {keys.length > 1 && (
        <span className="absolute right-1 top-1 rounded-chip bg-surface-card/90 px-1 text-[9px] font-semibold text-ink-600">
          +{keys.length - 1}
        </span>
      )}
    </div>
  )
}
