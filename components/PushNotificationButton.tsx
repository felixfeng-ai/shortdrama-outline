'use client'

import { useEffect, useState } from 'react'

import {
  activePushSubscription,
  disablePushNotifications,
  enablePushNotifications,
  fetchPushConfig,
} from '@/lib/push/client'

type PushState = 'checking' | 'ready' | 'subscribed' | 'blocked' | 'hidden'

export default function PushNotificationButton() {
  const [state, setState] = useState<PushState>('checking')
  const [publicKey, setPublicKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setState('hidden')
      return
    }
    let cancelled = false
    fetchPushConfig()
      .then(async (config) => {
        if (cancelled || !config.enabled || !config.publicKey) {
          if (!cancelled) setState('hidden')
          return
        }
        setPublicKey(config.publicKey)
        if (Notification.permission === 'denied') {
          setState('blocked')
          return
        }
        const subscription = await activePushSubscription()
        if (!cancelled) setState(subscription ? 'subscribed' : 'ready')
      })
      .catch(() => {
        if (!cancelled) setState('hidden')
      })
    return () => { cancelled = true }
  }, [])

  async function toggle() {
    if (busy || state === 'hidden' || state === 'checking' || state === 'blocked') return
    setBusy(true)
    setError('')
    try {
      if (state === 'subscribed') {
        await disablePushNotifications()
        setState('ready')
      } else {
        await enablePushNotifications(publicKey)
        setState('subscribed')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '完成通知设置失败')
      setState(Notification.permission === 'denied' ? 'blocked' : 'ready')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'checking' || state === 'hidden') return null
  const subscribed = state === 'subscribed'
  const blocked = state === 'blocked'
  const label = blocked
    ? '通知已拦截'
    : subscribed ? '完成通知已开' : '开启完成通知'

  return (
    <button
      type="button"
      className={`h-install h-push ${subscribed ? 'is-on' : ''}`}
      onClick={() => void toggle()}
      disabled={busy || blocked}
      aria-busy={busy}
      title={error || (blocked ? '请在浏览器站点设置中允许通知' : label)}
      aria-label={label}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5.5 8.2a4.5 4.5 0 0 1 9 0v3.1l1.2 2.1H4.3l1.2-2.1V8.2Z" />
        <path d="M8.2 15.2a1.9 1.9 0 0 0 3.6 0" />
        {subscribed && <path d="m6.8 8.4 2 2 4.2-4.2" />}
      </svg>
      <span>{label}</span>
    </button>
  )
}
