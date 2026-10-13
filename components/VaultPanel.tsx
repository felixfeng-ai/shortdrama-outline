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
  className?: string
}

export default function VaultPanel({ mode, files, onPickDirectory, onReload, onAdd, className = '' }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)

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

  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">本地图库</h3>
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
          图不上传
        </span>
      </div>

      <p className="mb-3 text-xs leading-relaxed text-slate-500">
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
              className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white
                transition-colors hover:bg-slate-700"
            >
              选择素材文件夹
            </button>
            <button
              type="button"
              onClick={onReload}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600
                transition-colors hover:border-slate-300"
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
              className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white
                transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {busy ? '处理中…' : '添加图片'}
            </button>
          </>
        )}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
        图库中共 {files.length} 张图片
      </p>

      {files.length > 0 && (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {files.slice(0, 50).map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 font-mono text-[10px] text-slate-400">{f.hash.slice(0, 6)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
