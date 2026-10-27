'use client'

import { useEffect, useState, type FormEvent } from 'react'

import {
  fetchAuthSessions,
  fetchAuthSession,
  logoutAuth,
  revokeAuthSession,
  requestEmailAuthCode,
  verifyEmailAuthCode,
  type AuthSessionDto,
  type AuthUserDto,
} from '@/lib/auth/client'
import { safeReturnPath } from '@/lib/auth/return-to'

type LoginStep = 'email' | 'code'

function validEmail(value: string): boolean {
  const email = value.trim()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)
}

function sessionSeen(timestamp: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return '刚刚活跃'
  if (minutes < 60) return `${minutes} 分钟前活跃`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前活跃`
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function LoginPanel() {
  const [user, setUser] = useState<AuthUserDto | null>(null)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [step, setStep] = useState<LoginStep>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [returnTo, setReturnTo] = useState('/')
  const [sessions, setSessions] = useState<AuthSessionDto[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [sessionBusyId, setSessionBusyId] = useState('')
  const [sessionMessage, setSessionMessage] = useState('')

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next')
    setReturnTo(safeReturnPath(next))
    fetchAuthSession()
      .then((data) => setUser(data.user))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  useEffect(() => {
    if (!user) {
      setSessions([])
      setSessionsLoading(false)
      return
    }
    let cancelled = false
    setSessionsLoading(true)
    fetchAuthSessions()
      .then((data) => {
        if (!cancelled) setSessions(data.sessions)
      })
      .catch(() => {
        if (!cancelled) setSessions([])
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false)
      })
    return () => { cancelled = true }
  }, [user])

  async function requestCode() {
    if (busy || cooldown > 0) return
    if (!validEmail(email)) {
      setError('请输入有效的邮箱地址。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await requestEmailAuthCode(email.trim())
      setStep('code')
      setCooldown(result.cooldownSeconds)
      setDevCode(result.devCode || '')
      if (result.devCode) setCode(result.devCode)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '验证码发送失败，请稍后重试。')
    } finally {
      setBusy(false)
    }
  }

  async function verify() {
    if (busy) return
    if (code.length !== 6) {
      setError('请输入 6 位验证码。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await verifyEmailAuthCode(email.trim(), code)
      setUser(result.user)
      window.location.assign(returnTo)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '登录失败，请检查验证码。')
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (step === 'email') void requestCode()
    else void verify()
  }

  function editEmail() {
    setStep('email')
    setCode('')
    setDevCode('')
    setError('')
  }

  async function logout() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await logoutAuth()
      setUser(null)
      setSessions([])
      setSessionsLoading(false)
      editEmail()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '退出失败，请稍后再试。')
    } finally {
      setBusy(false)
    }
  }

  async function revokeDevice(sessionId: string) {
    if (sessionBusyId) return
    setSessionBusyId(sessionId)
    setSessionMessage('')
    try {
      await revokeAuthSession(sessionId)
      setSessions((items) => items.filter((item) => item.id !== sessionId))
      setSessionMessage('该设备已退出登录。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '退出设备失败，请稍后再试。')
    } finally {
      setSessionBusyId('')
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <a className="auth-brand" href="/" aria-label="成剧 VeyaFrame 首页">
          <span className="auth-brand-mark" aria-hidden="true">V</span>
          <span className="auth-brand-name">VeyaFrame</span>
          <span className="auth-brand-cn">成剧</span>
        </a>
        <a className="auth-back" href={returnTo}>
          <span aria-hidden="true">←</span>
          返回工作台
        </a>
      </header>

      <section className="auth-story" aria-labelledby="auth-story-title">
        <div className="auth-story-copy">
          <p className="auth-kicker">PROJECT CONTINUITY / ACCOUNT</p>
          <h1 id="auth-story-title">
            先把戏<span className="auth-title-accent">做对</span>，<br />
            再把镜头<span className="auth-title-accent">生成</span>。
          </h1>
          <p className="auth-lede">
            人物、场次、分镜和创作意图在同一条项目链里。改一处，看得见影响；换设备，也能接着写。
          </p>
        </div>

        <div className="auth-proof-chain" aria-label="项目核心能力">
          <div className="auth-proof-node">
            <span className="auth-proof-index">01</span>
            <strong>角色锚点</strong>
            <small>贯穿全剧</small>
          </div>
          <div className="auth-proof-node">
            <span className="auth-proof-index">02</span>
            <strong>改动影响</strong>
            <small>看得见下游</small>
          </div>
          <div className="auth-proof-node">
            <span className="auth-proof-index">03</span>
            <strong>参考图不上传</strong>
            <small>项目可带走</small>
          </div>
        </div>
      </section>

      <section className="auth-access" aria-label="账号登录">
        <div className="auth-form-shell">
          {user ? (
            <div className="auth-account">
              <p className="auth-kicker">ACCOUNT / CONNECTED</p>
              <h2>项目已连接到你的账号</h2>
              <p className="auth-form-intro">
                Web、PWA 与 App 使用同一账号读取项目。当前浏览器里的项目已经完成归属。
              </p>
              <dl className="auth-account-meta">
                <div>
                  <dt>{user.email ? '邮箱' : '手机号'}</dt>
                  <dd>{user.email || user.phone || user.displayName}</dd>
                </div>
                <div>
                  <dt>会话状态</dt>
                  <dd>已登录</dd>
                </div>
              </dl>
              <div className="auth-sessions">
                <div className="auth-sessions-head">
                  <span>活跃设备</span>
                  <span>{sessions.length}</span>
                </div>
                {sessionsLoading ? (
                  <p className="auth-sessions-empty">正在读取设备会话…</p>
                ) : sessions.length === 0 ? (
                  <p className="auth-sessions-empty">暂无活跃设备。</p>
                ) : (
                  <ul>
                    {sessions.map((session) => (
                      <li key={session.id}>
                        <span className="auth-session-mark" aria-hidden="true" />
                        <span className="auth-session-copy">
                          <b>{session.deviceName}</b>
                          <small>
                            {session.current ? '当前设备 · ' : ''}
                            {sessionSeen(session.lastSeenAt)}
                          </small>
                        </span>
                        {!session.current && (
                          <button
                            type="button"
                            disabled={Boolean(sessionBusyId)}
                            onClick={() => void revokeDevice(session.id)}
                          >
                            {sessionBusyId === session.id ? '退出中…' : '退出'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="auth-session-status" aria-live="polite">{sessionMessage}</p>
              </div>
              {error && <p className="auth-alert" role="alert">{error}</p>}
              <button className="auth-secondary auth-logout" type="button" disabled={busy} onClick={() => void logout()}>
                {busy ? '正在退出…' : '退出登录'}
              </button>
              <p className="auth-footnote">退出后，账号项目不会再显示在当前匿名会话中。</p>
            </div>
          ) : (
            <>
              <div className="auth-form-heading">
                <h2>{step === 'email' ? '继续这个项目' : '输入验证码'}</h2>
                <p className="auth-form-intro">
                  {step === 'email'
                    ? '用邮箱验证码保存当前项目，之后可以在其他设备找回。'
                    : `验证码已发送至 ${email.trim()}。`}
                </p>
              </div>

              <div className="auth-steprail" aria-hidden="true">
                <span className="on">01 邮箱</span>
                <span className={step === 'code' ? 'on' : ''}>02 验证码</span>
              </div>

              <form className="auth-form" onSubmit={submit} aria-busy={busy}>
                {step === 'email' ? (
                  <label className="auth-field" htmlFor="auth-email">
                    <span>邮箱验证码</span>
                    <input
                      id="auth-email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value)
                        if (error) setError('')
                      }}
                      placeholder="writer@example.com"
                      aria-describedby="auth-email-hint"
                      aria-invalid={Boolean(error)}
                    />
                    <small id="auth-email-hint">验证码会发送到该邮箱，用于登录和找回项目。</small>
                  </label>
                ) : (
                  <>
                    <div className="auth-phone-summary">
                      <span>{email.trim()}</span>
                      <button type="button" onClick={editEmail}>修改邮箱</button>
                    </div>
                    <label className="auth-field" htmlFor="auth-code">
                      <span>验证码</span>
                      <input
                        id="auth-code"
                        name="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        maxLength={6}
                        value={code}
                        onChange={(event) => {
                          setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                          if (error) setError('')
                        }}
                        placeholder="6 位数字"
                        aria-invalid={Boolean(error)}
                      />
                    </label>
                    <div className="auth-code-actions">
                      <button type="button" disabled={busy || cooldown > 0} onClick={() => void requestCode()}>
                        {cooldown > 0 ? `重新获取（${cooldown}s）` : '重新获取'}
                      </button>
                      <span>{devCode ? `本地验证码 ${devCode}` : '验证码 5 分钟内有效'}</span>
                    </div>
                  </>
                )}

                <div aria-live="polite">
                  {error && <p className="auth-alert" role="alert">{error}</p>}
                </div>

                <button
                  className="auth-primary"
                  type="submit"
                  disabled={busy || (step === 'email' ? !validEmail(email) : code.length !== 6)}
                >
                  {busy
                    ? <><span className="auth-spinner" aria-hidden="true" />{step === 'email' ? '正在发送…' : '正在登录…'}</>
                    : step === 'email' ? '发送验证码' : '登录并继续项目'}
                </button>
              </form>

              <p className="auth-footnote">
                邮箱仅用于登录和项目归属，不会用于营销邮件。
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
