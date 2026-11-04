'use client'

import { useEffect, useState } from 'react'

type PermissionState = NotificationPermission | 'unsupported' | 'insecure'

function currentPermission(): PermissionState {
  if (typeof window === 'undefined') return 'unsupported'
  if (!window.isSecureContext) return 'insecure'
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export default function TaskNotificationControl() {
  const [permission, setPermission] = useState<PermissionState>('unsupported')
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    setPermission(currentPermission())
  }, [])

  async function request() {
    if (requesting || permission !== 'default') return
    setRequesting(true)
    try {
      const next = typeof Notification === 'undefined'
        ? 'unsupported'
        : await Notification.requestPermission()
      setPermission(next)
    } catch {
      setPermission(currentPermission())
    } finally {
      setRequesting(false)
    }
  }

  const copy =
    permission === 'granted'
      ? { label: '系统通知', value: '已开启', action: false }
      : permission === 'denied'
        ? { label: '系统通知', value: '系统已阻止', action: false }
        : permission === 'insecure'
          ? { label: '系统通知', value: '仅 HTTPS 可用', action: false }
          : permission === 'unsupported'
            ? { label: '系统通知', value: '当前浏览器不支持', action: false }
            : { label: '系统通知', value: '未开启', action: true }

  return (
    <div className="mobile-app-notification-control">
      <div>
        <b>{copy.label}</b>
        <small>{copy.value}</small>
      </div>
      {copy.action ? (
        <button
          type="button"
          className="min-h-11"
          onClick={() => void request()}
          disabled={requesting}
        >
          {requesting ? '正在开启…' : '开启系统通知'}
        </button>
      ) : (
        <span className={permission === 'granted' ? 'is-on' : ''} aria-label={`${copy.label}：${copy.value}`}>
          {copy.value}
        </span>
      )}
    </div>
  )
}
