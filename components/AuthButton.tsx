'use client'

import { useEffect, useState } from 'react'

import { fetchAuthSession, type AuthUserDto } from '@/lib/auth/client'

interface Props {
  variant?: 'default' | 'workspace-avatar' | 'workspace-user'
}

export default function AuthButton({ variant = 'default' }: Props) {
  const [user, setUser] = useState<AuthUserDto | null>(null)

  useEffect(() => {
    fetchAuthSession()
      .then((data) => setUser(data.user))
      .catch(() => {})
  }, [])

  function openLogin(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    const next = `${window.location.pathname}${window.location.search}`
    window.location.assign(`/login?next=${encodeURIComponent(next)}`)
  }

  const accountLabel = user?.username || user?.displayName || "登录"
  const initial = user ? accountLabel.trim().slice(0, 1).toUpperCase() : '登'

  return (
    <a
      href="/login"
      className={`h-install ${variant === 'default' ? '' : `is-${variant}`}`}
      onClick={openLogin}
      title={user
        ? `已登录 ${accountLabel}${user.email ? ` · ${user.email}` : user.phone ? ` · ${user.phone}` : ''}`
        : '登录后跨设备找回项目'}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="6.5" r="3" />
        <path d="M4.5 16c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
      </svg>
      <span className="wfx-user-initial" aria-hidden="true">{initial}</span>
      <span className="wfx-user-label">{accountLabel}</span>
    </a>
  )
}
