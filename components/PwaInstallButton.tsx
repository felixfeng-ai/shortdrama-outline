'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

async function syncServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (process.env.NODE_ENV === 'production') {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await registration.update().catch(() => {})
    return
  }

  /*
   * 开发服务器会不断生成新的 HMR chunk。旧 Service Worker 的 cache-first
   * 会把已经删除的模块继续返回给浏览器，表现为 “module factory is not available”。
   * 开发环境主动注销 SW 并清掉站点 shell 缓存，避免本地调试被旧 chunk 污染。
   */
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.map((registration) => registration.unregister()))
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(
      keys.filter((key) => key.startsWith('chengju-shell-')).map((key) => caches.delete(key)),
    )
  }
}

export default function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installTarget, setInstallTarget] = useState<'桌面' | '主屏'>('桌面')

  useEffect(() => {
    void syncServiceWorker().catch(() => {})

    const mobileQuery = window.matchMedia('(max-width: 820px), (pointer: coarse)')
    const syncInstallTarget = () => setInstallTarget(mobileQuery.matches ? '主屏' : '桌面')
    syncInstallTarget()
    mobileQuery.addEventListener('change', syncInstallTarget)

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstallPrompt(null)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      mobileQuery.removeEventListener('change', syncInstallTarget)
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    const priorInstallPrompt = installPrompt
    if (!priorInstallPrompt) return
    setInstallPrompt(null)
    await priorInstallPrompt.prompt()
    await priorInstallPrompt.userChoice.catch(() => null)
  }

  if (!installPrompt) return null

  return (
    <button
      type="button"
      className="h-install"
      onClick={() => void install()}
      title={`将成剧添加到${installTarget}`}
      aria-label={`添加到${installTarget}`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2.5v9m0 0 3.5-3.5M10 11.5 6.5 8M3.5 13v2A1.5 1.5 0 0 0 5 16.5h10a1.5 1.5 0 0 0 1.5-1.5v-2" />
      </svg>
      <span>添加到{installTarget}</span>
    </button>
  )
}
