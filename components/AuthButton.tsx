'use client'

import { useEffect, useState } from 'react'

import { fetchAuthSession, type AuthUserDto } from '@/lib/auth/client'

export default function AuthButton() {
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

  const accountLabel = user?.displayName || user?.email || user?.phone || "登录"

  return (
    <a
      href="/login"
      className="h-install"
      onClick={openLogin}
      title={user ? `已登录 ${user.email || user.phone || user.displayName}` : '登录后跨设备找回项目'}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="6.5" r="3" />
        <path d="M4.5 16c.7-3 2.5-4.5 5.5-4.5s4.8 1.5 5.5 4.5" />
      </svg>
      <span>{accountLabel}</span>
    </a>
  )
}
