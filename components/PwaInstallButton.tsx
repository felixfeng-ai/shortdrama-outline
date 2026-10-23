'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export default function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setInstallPrompt(null)

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
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
      title="安装成剧到桌面或主屏"
      aria-label="安装应用"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 2.5v9m0 0 3.5-3.5M10 11.5 6.5 8M3.5 13v2A1.5 1.5 0 0 0 5 16.5h10a1.5 1.5 0 0 0 1.5-1.5v-2" />
      </svg>
      <span>安装应用</span>
    </button>
  )
}
