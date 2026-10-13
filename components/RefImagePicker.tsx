'use client'

// 参考图选择器：带缩略图的下拉。
//
// 为什么不能用 <select>：用户面对的是几十上百张图，文件名多半是
// 「即梦_19700101.png」这种，靠文字认不出哪张是哪个角色。
// 选图这件事必须看得见图。
//
// 预览走本地：fs-access 从授权目录读，indexeddb 从库里取，都不经服务端。
import { useEffect, useMemo, useRef, useState } from 'react'
import { getPreviewUrl, type VaultFile } from '@/lib/assets/vault'

interface Props {
  files: VaultFile[]
  /** 角色名，用于按名字给一个推荐顺序（目录名命中的排前面） */
  characterName?: string
  onPick: (file: VaultFile) => void
  onClose: () => void
}

/**
 * 把文件的 basename 去掉扩展名，当作显示名。
 * 同时算出它在目录里的「线索」——比如 "林远/正面.png" 的线索是 "林远"。
 */
function displayName(key: string): string {
  return (key.split('/').pop() ?? key).replace(/\.[^.]+$/, '')
}

function dirHint(key: string): string | null {
  const parts = key.split('/').filter(Boolean)
  return parts.length > 1 ? parts.slice(0, -1).join('/') : null
}

export default function RefImagePicker({ files, characterName, onPick, onClose }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const createdUrls = useRef<string[]>([])

  // 挂载时批量取预览图；卸载时把 blob URL 全部释放，避免内存泄漏
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      const next: Record<string, string> = {}
      for (const file of files) {
        const url = await getPreviewUrl(file.key).catch(() => null)
        if (cancelled) {
          if (url) URL.revokeObjectURL(url)
          return
        }
        if (url) {
          next[file.key] = url
          createdUrls.current.push(url)
        } else {
          setFailed((prev) => new Set(prev).add(file.key))
        }
      }
      if (!cancelled) setUrls(next)
    })()

    return () => {
      cancelled = true
      for (const url of createdUrls.current) URL.revokeObjectURL(url)
      createdUrls.current = []
    }
  }, [files])

  // 搜索：支持按目录名、文件名匹配。挂图时用户脑子里想的是「林远那张」
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return files
    return files.filter((f) => f.key.toLowerCase().includes(q))
  }, [files, query])

  // 目录名包含角色名时排在前面——用户按角色分文件夹的话，这里会直接聚在一起
  const sorted = useMemo(() => {
    if (!characterName) return visible
    const name = characterName.toLowerCase()
    return [...visible].sort((a, b) => {
      const hit = (k: string) => ((dirHint(k) ?? '').toLowerCase().includes(name) ? 0 : 1)
      return hit(a.key) - hit(b.key)
    })
  }, [visible, characterName])

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按文件名或文件夹名筛选…"
          aria-label="筛选参考图"
          className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
        />
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-200"
        >
          取消
        </button>
      </div>

      {sorted.length === 0 ? (
        <p className="px-1 py-3 text-center text-xs text-slate-400">
          {files.length === 0 ? '图库里还没有图片' : '没有匹配的图片'}
        </p>
      ) : (
        <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {sorted.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                onClick={() => onPick(f)}
                title={f.key}
                className="group w-full rounded-lg border border-slate-200 bg-white p-1 text-left
                  transition-colors hover:border-brand-400 hover:bg-brand-50
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                <div className="mb-1 flex h-20 items-center justify-center overflow-hidden rounded bg-slate-100">
                  {urls[f.key] ? (
                    <img src={urls[f.key]} alt={f.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-1 text-center text-[10px] leading-tight text-slate-400">
                      {failed.has(f.key) ? '读不到图' : '加载中…'}
                    </span>
                  )}
                </div>
                <p className="truncate text-[10px] font-medium text-slate-700">{displayName(f.key)}</p>
                {dirHint(f.key) && (
                  <p className="truncate text-[9px] text-slate-400">{dirHint(f.key)}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[10px] text-slate-400">
        共 {sorted.length} 张 · 预览在本地读取，图不上传
      </p>
    </div>
  )
}
