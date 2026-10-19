'use client'

/*
  【当前未挂载】保留文件以便上线后按效果决定是否恢复主题对照。

  注意：这个组件会读旧的 localStorage key（chengju:theme）并在挂载时
  applyTheme()。恢复前必须先改成新的存储策略，否则它会像上次那样
  把纸墨主题写回去，覆盖 h-deck 默认值。
*/
import { useEffect, useState } from 'react'
import { THEMES, applyTheme, resolveTheme, type ThemeId } from '@/lib/theme'

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeId>('h-deck')

  useEffect(() => {
    const stored = typeof window === 'undefined' ? null : window.localStorage.getItem('chengju:theme')
    const initial = resolveTheme(window.location.search, stored)
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const pick = (id: ThemeId) => {
    setTheme(id)
    applyTheme(id)
  }

  return (
    <div
      role="group"
      aria-label="底色对照"
      className="hidden items-center gap-0.5 rounded-pill border border-surface-line bg-surface-card p-0.5 md:flex"
    >
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => pick(t.id)}
          aria-pressed={theme === t.id}
          title={t.hint}
          className={`rounded-pill px-2.5 py-1 text-[11px] transition-colors ${
            theme === t.id
              ? 'bg-accent-100 font-semibold text-accent-700'
              : 'text-ink-500 hover:bg-surface-soft hover:text-ink-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
