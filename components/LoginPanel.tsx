'use client'

import { useEffect, useState, type FormEvent } from 'react'

import {
  fetchAuthSession,
  logoutAuth,
  requestAuthCode,
  verifyAuthCode,
  type AuthUserDto,
} from '@/lib/auth/client'
import { safeReturnPath } from '@/lib/auth/return-to'

type LoginStep = 'phone' | 'code'

function validPhone(value: string): boolean {
  const digits = value.trim().replaceAll(' ', '').replaceAll('-', '').replace(/^\+86/, '')
  return /^1[3-9]\d{9}$/.test(digits)
}

export default function LoginPanel() {
  const [user, setUser] = useState<AuthUserDto | null>(null)
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState('')
  const [step, setStep] = useState<LoginStep>('phone')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [returnTo, setReturnTo] = useState('/')

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

  async function requestCode() {
    if (busy || cooldown > 0) return
    if (!validPhone(phone)) {
      setError('请输入有效的中国大陆手机号。')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await requestAuthCode(phone.trim())
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
      const result = await verifyAuthCode(phone.trim(), code)
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
    if (step === 'phone') void requestCode()
    else void verify()
  }

  function editPhone() {
    setStep('phone')
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
      editPhone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '退出失败，请稍后再试。')
    } finally {
      setBusy(false)
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
          <p className="auth-kicker">STORY DESK / ACCOUNT</p>
          <h1 id="auth-story-title">一句想法，<br />长成能出图的分镜。</h1>
          <p className="auth-lede">
            人物、结构、分集与资产都在同一个项目里。登录后，换一台设备也能接着写。
          </p>
        </div>

        <ol className="auth-pipeline" aria-label="创作流程">
          {['人物', '三幕', '分集', '定妆', '场次', '分镜'].map((label, index) => (
            <li key={label}>
              <span className="auth-pipeline-index">{String(index + 1).padStart(2, '0')}</span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
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
                  <dt>手机号</dt>
                  <dd>{user.phone}</dd>
                </div>
                <div>
                  <dt>会话状态</dt>
                  <dd>已登录</dd>
                </div>
              </dl>
              {error && <p className="auth-alert" role="alert">{error}</p>}
              <button className="auth-secondary auth-logout" type="button" disabled={busy} onClick={() => void logout()}>
                {busy ? '正在退出…' : '退出登录'}
              </button>
              <p className="auth-footnote">退出后，账号项目不会再显示在当前匿名会话中。</p>
            </div>
          ) : (
            <>
              <div className="auth-form-heading">
                <p className="auth-kicker">PHONE SIGN-IN</p>
                <h2>{step === 'phone' ? '登录成剧' : '输入验证码'}</h2>
                <p className="auth-form-intro">
                  {step === 'phone'
                    ? '用手机号登录，认领当前浏览器里的项目。'
                    : `验证码已发送至 ${phone.trim()}。`}
                </p>
              </div>

              <div className="auth-steprail" aria-hidden="true">
                <span className="on">01 手机号</span>
                <span className={step === 'code' ? 'on' : ''}>02 验证</span>
              </div>

              <form className="auth-form" onSubmit={submit} aria-busy={busy}>
                {step === 'phone' ? (
                  <label className="auth-field" htmlFor="auth-phone">
                    <span>手机号</span>
                    <input
                      id="auth-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      autoFocus
                      value={phone}
                      onChange={(event) => {
                        setPhone(event.target.value)
                        if (error) setError('')
                      }}
                      placeholder="138 0013 8000"
                      aria-describedby="auth-phone-hint"
                      aria-invalid={Boolean(error)}
                    />
                    <small id="auth-phone-hint">中国大陆手机号，用于登录与跨设备找回项目。</small>
                  </label>
                ) : (
                  <>
                    <div className="auth-phone-summary">
                      <span>{phone.trim()}</span>
                      <button type="button" onClick={editPhone}>修改手机号</button>
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
                  disabled={busy || (step === 'phone' ? !validPhone(phone) : code.length !== 6)}
                >
                  {busy
                    ? <><span className="auth-spinner" aria-hidden="true" />{step === 'phone' ? '正在发送…' : '正在登录…'}</>
                    : step === 'phone' ? '获取验证码' : '登录并认领项目'}
                </button>
              </form>

              <p className="auth-footnote">
                手机号只用于登录和项目归属，不会展示给其他用户。
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
