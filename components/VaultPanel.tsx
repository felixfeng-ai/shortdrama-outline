'use client'

// 本地图库面板（原则 P1 的界面落点）。
//
// 界面里必须让用户看得见「图在你自己机器上」——这不是营销话术，
// 是产品设计：图库有两个模式，界面上明确显示当前模式与文件数。
import { useRef, useState } from 'react'
import type { VaultFile, VaultMode } from '@/lib/assets/vault'
import { addFilesToVault } from '@/lib/assets/vault'

interface Props {
  mode: VaultMode
  files: VaultFile[]
  onPickDirectory: () => void
  onReload: () => void
  onAdd: (added: VaultFile[]) => void
  /** 从工作台里移除一张图（目录直连模式下只「不再显示」，不动硬盘文件） */
  onIgnore: (key: string) => void
  /** 被移除的张数，> 0 时给一个恢复入口 */
  ignoredCount: number
  onRestore: () => void
  /** 目录直连 = 断开文件夹；IndexedDB = 真的清空 */
  onClear: () => void
  className?: string
  /** Non-asset steps only show a compact status row. */
  compact?: boolean
  onManage?: () => void
}

export default function VaultPanel({
  mode,
  files,
  onPickDirectory,
  onReload,
  onAdd,
  onIgnore,
  ignoredCount,
  onRestore,
  onClear,
  className = '',
  compact = false,
  onManage,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  /** 危险动作要二次确认：断开/清空点错了，用户得重新扫一遍 */
  const [confirming, setConfirming] = useState(false)

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    setBusy(true)
    try {
      onAdd(await addFilesToVault(Array.from(list)))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (compact) {
    const primaryLabel = mode === 'fs-access'
      ? files.length > 0 ? '重新扫描' : '选择素材文件夹'
      : '添加图片'
    return (
      <div className="vault-panel vault-panel-compact surface flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
        <span className="shrink-0 text-[11px] font-semibold text-ink-700">本地图库</span>
        <span className="rounded-chip bg-done-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-done-700">
          图不上传
        </span>
        <p className="min-w-[10rem] flex-1 text-[11px] text-ink-500">
          {files.length} 张图片 · {mode === 'fs-access' ? '目录直连' : '浏览器本地存储'}
        </p>
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            className="min-h-10 shrink-0 rounded-pill border border-surface-line px-2.5 py-1 text-[11px] text-ink-600
              transition-colors hover:border-accent-300 hover:text-accent-700"
          >
            管理素材
          </button>
        )}
        {mode === 'indexeddb' && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (mode === 'indexeddb') inputRef.current?.click()
            else if (files.length > 0) onReload()
            else onPickDirectory()
          }}
          className="min-h-10 shrink-0 rounded-pill bg-accent-700 px-2.5 py-1 text-[11px] font-medium text-white
            transition-colors hover:bg-accent-800 disabled:opacity-50"
        >
          {busy ? '处理中…' : primaryLabel}
        </button>
      </div>
    )
  }

  return (
    <div className={`vault-panel vault-panel-full rounded-card border border-surface-line bg-surface-card p-4 shadow-surface ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-900">本地图库</h3>
        <span className="rounded-chip bg-done-100 px-1.5 py-0.5 text-[10px] font-semibold text-done-700">
          图不上传
        </span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-ink-500">
        {mode === 'fs-access'
          ? '已用目录直连：选一个文件夹当素材库，图留在你硬盘上，服务端只记「哪张图属于谁」。'
          : '当前浏览器不支持目录直连，图片会存在浏览器本地存储里（同样不上传）。'}
      </p>

      <div className="flex flex-col gap-2">
        {mode === 'fs-access' ? (
          <>
            <button
              type="button"
              onClick={onPickDirectory}
              className="w-full rounded-chip bg-ink-900 px-3 py-2 text-sm font-medium text-surface-card
                transition-colors hover:bg-ink-700"
            >
              选择素材文件夹
            </button>
            <button
              type="button"
              onClick={onReload}
              className="w-full rounded-chip border border-surface-line px-3 py-2 text-xs font-medium text-ink-600
                transition-colors hover:border-ink-300 hover:bg-surface"
            >
              重新扫描
            </button>
          </>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="w-full rounded-chip bg-ink-900 px-3 py-2 text-sm font-medium text-surface-card
                transition-colors hover:bg-ink-700 disabled:opacity-50"
            >
              {busy ? '处理中…' : '添加图片'}
            </button>
          </>
        )}
      </div>

      <p className="mt-3 border-t border-surface-line pt-2 text-xs text-ink-500">
        图库中共 {files.length} 张图片
        {ignoredCount > 0 && `（另有 ${ignoredCount} 张已移除，未计入）`}
      </p>

      {files.length > 0 && (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {files.slice(0, 50).map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-2 text-[11px] text-ink-500">
              <span className="truncate">{f.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-mono text-[10px] text-ink-300">{f.hash.slice(0, 6)}</span>
                <button
                  type="button"
                  onClick={() => onIgnore(f.key)}
                  title={
                    mode === 'fs-access'
                      ? '只从工作台列表里移除，你硬盘上的文件不会被删'
                      : '从浏览器本地存储里删除这张图'
                  }
                  className="rounded-pill px-2 py-0.5 text-[10px] text-ink-400 transition-colors
                    hover:bg-accent-50 hover:text-accent-700"
                >
                  {mode === 'fs-access' ? '不再显示' : '删除'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 被移除过的图可以一键恢复：误点了要有退路 */}
      {ignoredCount > 0 && (
        <button
          type="button"
          onClick={onRestore}
          className="mt-2 w-full rounded-chip border border-surface-line px-3 py-1.5 text-[11px] text-ink-500
            transition-colors hover:border-accent-300 hover:text-accent-700"
        >
          恢复已移除的 {ignoredCount} 张
        </button>
      )}

      {/* 整个图库的出口。两种模式说法必须不同：一个只是断开连接，一个是真的删 */}
      <div className="mt-3 border-t border-surface-line pt-3">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-accent-800">
              {mode === 'fs-access'
                ? '确认断开这个素材文件夹？你硬盘上的图片不会被删除，只是工作台不再显示它们。'
                : '确认清空本地图库？浏览器里存着的图片会被删除，之后需要重新添加。'}
            </p>
            <button
              type="button"
              onClick={() => { onClear(); setConfirming(false) }}
              className="shrink-0 rounded-pill bg-accent-600 px-3 py-1.5 text-[11px] font-medium text-white
                transition-colors hover:bg-accent-700"
            >
              确认
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="shrink-0 rounded-pill border border-surface-line px-3 py-1.5 text-[11px] text-ink-600
                transition-colors hover:text-ink-800"
            >
              取消
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-pill border border-surface-line px-3 py-1.5 text-[11px] text-ink-600
                transition-colors hover:border-accent-300 hover:text-accent-700"
            >
              {mode === 'fs-access' ? '断开素材文件夹' : '清空本地图库'}
            </button>
            <span className="ml-2 text-[10.5px] text-ink-400">
              {mode === 'fs-access' ? '不会删除你硬盘上的文件' : '会删除浏览器里存着的图片'}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
