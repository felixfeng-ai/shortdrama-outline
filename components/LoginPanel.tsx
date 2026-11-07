'use client'

import { useEffect, useState, type FormEvent } from 'react'

import {
  fetchAuthSessions,
  fetchAuthSession,
  logoutAuth,
  revokeAuthSession,
  requestEmailAuthCode,
  updateAccountUsername,
  verifyEmailAuthCode,
  type AuthSessionDto,
  type AuthUserDto,
} from '@/lib/auth/client'
import { safeReturnPath } from '@/lib/auth/return-to'
import { normalizeUsername } from '@/lib/auth/username'
import VeyaBrandMark from './VeyaBrandMark'

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
  const [usernameDraft, setUsernameDraft] = useState('')
  const [usernameBusy, setUsernameBusy] = useState(false)
  const [usernameMessage, setUsernameMessage] = useState('')

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get('next')
    setReturnTo(safeReturnPath(next))
    fetchAuthSession()
      .then((data) => {
        setUser(data.user)
        setUsernameDraft(data.user?.username || '')
      })
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
      setUsernameDraft(result.user.username || '')
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

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (usernameBusy || !user) return
    let username = ''
    try {
      username = normalizeUsername(usernameDraft)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '用户名格式不正确。')
      setUsernameMessage('')
      return
    }
    setUsernameBusy(true)
    setError('')
    setUsernameMessage('')
    try {
      const result = await updateAccountUsername(username)
      setUser(result.user)
      setUsernameDraft(result.user.username)
      setUsernameMessage('用户名已更新。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '用户名保存失败，请稍后重试。')
    } finally {
      setUsernameBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <a className="auth-brand" href="/" aria-label="成剧 VeyaFrame 首页">
          <span className="auth-brand-mark" aria-hidden="true"><VeyaBrandMark /></span>
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
          <p className="auth-kicker">短剧创作工作台</p>
          <h1 id="auth-story-title">
            回来接着写，<br />
            把下一场做成<span className="auth-title-accent">镜头</span>。
          </h1>
          <p className="auth-lede">
            人物、分集、场次、分镜和首帧都在同一个项目里。
            AI 继续往前推，角色像不像、镜头对不对，仍由你确认。
          </p>
        </div>

        <div className="auth-proof-chain" aria-label="项目核心能力">
          <div className="auth-proof-node">
            <span className="auth-proof-index">01</span>
            <strong>人物跨镜不走样</strong>
            <small>同一角色，每个镜头仍是同一张脸</small>
          </div>
          <div className="auth-proof-node">
            <span className="auth-proof-index">02</span>
            <strong>场次直接接分镜</strong>
            <small>从这一场戏继续拆镜头，不用换工具</small>
          </div>
          <div className="auth-proof-node">
            <span className="auth-proof-index">03</span>
            <strong>每次修改可回看</strong>
            <small>确认后生成新版本，改错也能回头</small>
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
                  <dt>用户名</dt>
                  <dd>{user.username || user.displayName}</dd>
                </div>
                <div>
                  <dt>{user.email ? '邮箱' : '手机号'}</dt>
                  <dd>{user.email || user.phone || '未绑定'}</dd>
                </div>
                <div>
                  <dt>会话状态</dt>
                  <dd>已登录</dd>
                </div>
              </dl>
              <form className="auth-username-form" onSubmit={saveUsername} aria-busy={usernameBusy}>
                <header>
                  <b>工作区用户名</b>
                  <span>只展示名称，不公开邮箱或手机号</span>
                </header>
                <div className="auth-username-row">
                  <label className="auth-field" htmlFor="auth-username">
                    <span>用户名</span>
                    <input
                      id="auth-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      maxLength={16}
                      value={usernameDraft}
                      onChange={(event) => {
                        setUsernameDraft(event.target.value)
                        setUsernameMessage('')
                        if (error) setError('')
                      }}
                      aria-describedby="auth-username-hint"
                      aria-invalid={Boolean(error)}
                    />
                  </label>
                  <button
                    className="auth-secondary auth-username-save"
                    type="submit"
                    disabled={usernameBusy || usernameDraft.trim() === user.username}
                  >
                    {usernameBusy ? '保存中…' : '保存用户名'}
                  </button>
                </div>
                <small id="auth-username-hint">2–16 个中英文、数字、下划线或短横线。</small>
                <p className="auth-username-status" aria-live="polite">{usernameMessage}</p>
              </form>
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
                    ? '用邮箱验证码登录。换设备后，人物、分镜和版本仍在原位。'
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

              <p className="auth-consent">
                继续即表示你已阅读并同意
                <a href="/legal#terms">《用户协议》</a>
                和
                <a href="/legal#privacy">《隐私政策》</a>。
              </p>
              <p className="auth-footnote">
                邮箱仅用于登录和项目归属，不会用于营销邮件。
              </p>
              <nav className="auth-legal-links" aria-label="隐私与内容规则">
                <a href="/legal">完整法律与隐私说明</a>
                <a href="/legal#ai">AI 内容说明</a>
                <a href="/report">举报内容</a>
              </nav>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
