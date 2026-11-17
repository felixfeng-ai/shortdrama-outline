"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"

import "./admin.css"

type AdminTab = "overview" | "users" | "vitals"

interface AdminSummary {
  users: number
  projects: number
  generationTasks: number
  succeededTasks: number
  failedTasks: number
  quotaUsedToday: number
  activeQuotaOverrides: number
  openFeedback: number
  recentAppErrors: number
  vitalsSamples: number
  recentOperations: Array<{
    id: string
    action: string
    targetUserId: string
    detail: Record<string, unknown>
    createdAt: number
  }>
}

interface AdminUser {
  id: string
  email: string | null
  username: string
  createdAt: number
  lastSeenAt: number | null
  projectCount: number
  quota: {
    used: number
    limit: number
    remaining: number
    extraUnits: number
    expiresAt: number | null
    reason: string
  }
}

interface VitalRow {
  name: string
  path: string
  device: string
  samples: number
  p50: number
  p75: number
  p95: number
}

interface ApiEnvelope<T> {
  success: boolean
  data: T | null
  error: string | null
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  })
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null
  if (response.status === 403) {
    const error = new Error("forbidden")
    error.name = "AdminForbidden"
    throw error
  }
  if (!response.ok || !payload?.success || payload.data === null) {
    throw new Error(payload?.error || "管理接口暂不可用")
  }
  return payload.data
}

const formatTime = (value: number | null) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "暂无记录"

const metricLabels: Array<[keyof AdminSummary, string]> = [
  ["users", "注册用户"],
  ["projects", "项目总数"],
  ["generationTasks", "生成任务"],
  ["succeededTasks", "成功任务"],
  ["failedTasks", "失败任务"],
  ["quotaUsedToday", "今日额度"],
  ["activeQuotaOverrides", "生效额度覆盖"],
  ["openFeedback", "待处理反馈"],
  ["recentAppErrors", "近 7 天错误"],
  ["vitalsSamples", "性能样本"],
]

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>("overview")
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [vitals, setVitals] = useState<VitalRow[]>([])
  const [selectedId, setSelectedId] = useState("")
  const [query, setQuery] = useState("")
  const [search, setSearch] = useState("")
  const [extraUnits, setExtraUnits] = useState("20")
  const [days, setDays] = useState("7")
  const [reason, setReason] = useState("内测支持")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const selected = users.find((user) => user.id === selectedId) ?? null
  const successRate = summary && summary.generationTasks > 0
    ? Math.round((summary.succeededTasks / summary.generationTasks) * 100)
    : 0

  const loadSummary = useCallback(async () => {
    const data = await api<AdminSummary>("/api/admin/summary")
    setSummary(data)
  }, [])

  const loadUsers = useCallback(async (keyword = "") => {
    const data = await api<{ users: AdminUser[] }>(
      `/api/admin/users?query=${encodeURIComponent(keyword)}`,
    )
    setUsers(data.users)
    setSelectedId((current) =>
      data.users.some((user) => user.id === current)
        ? current
        : data.users[0]?.id ?? "",
    )
  }, [])

  const loadVitals = useCallback(async () => {
    const data = await api<{ rows: VitalRow[] }>("/api/admin/vitals?days=7")
    setVitals(data.rows)
  }, [])

  const load = useCallback(async (activeTab: AdminTab) => {
    setLoading(true)
    setError("")
    setForbidden(false)
    try {
      if (activeTab === "overview") await loadSummary()
      if (activeTab === "users") await loadUsers(search)
      if (activeTab === "vitals") await loadVitals()
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AdminForbidden") {
        setForbidden(true)
      } else {
        setError(cause instanceof Error ? cause.message : "后台数据读取失败")
      }
    } finally {
      setLoading(false)
    }
  }, [loadSummary, loadUsers, loadVitals, search])

  useEffect(() => {
    void load(tab)
  }, [load, tab])

  async function submitOverride() {
    if (!selected || busy) return
    const units = Number(extraUnits)
    const duration = Number(days)
    if (!Number.isFinite(units) || units < 1 || !Number.isFinite(duration)) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await api<unknown>("/api/admin/quota-overrides", {
        method: "POST",
        body: JSON.stringify({
          targetUserId: selected.id,
          extraUnits: units,
          expiresAt: Date.now() + duration * 86_400_000,
          reason,
        }),
      })
      setNotice(`已为 ${selected.username} 增加 ${units} 单位`)
      await Promise.all([loadUsers(search), loadSummary()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "额度保存失败")
    } finally {
      setBusy(false)
    }
  }

  async function revokeOverride() {
    if (!selected || !selected.quota.extraUnits || busy) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      await api<unknown>("/api/admin/quota-overrides", {
        method: "DELETE",
        body: JSON.stringify({
          targetUserId: selected.id,
          reason: "管理员手动撤销",
        }),
      })
      setNotice(`已撤销 ${selected.username} 的临时额度`)
      await Promise.all([loadUsers(search), loadSummary()])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "额度撤销失败")
    } finally {
      setBusy(false)
    }
  }

  if (forbidden) {
    return (
      <main className="admin-page admin-locked">
        <div className="admin-locked-mark" aria-hidden="true">V</div>
        <p className="admin-kicker">ADMIN ACCESS</p>
        <h1>当前账号没有管理员权限</h1>
        <p>请使用已加入服务端管理员邮箱白名单的账号登录。</p>
        <Link href="/login">返回登录</Link>
      </main>
    )
  }

  return (
    <main className="admin-page">
      <header className="admin-topbar">
        <Link className="admin-brand" href="/">
          <span>V</span>
          <b>VeyaTV</b>
          <em>OPERATIONS</em>
        </Link>
        <nav aria-label="后台导航">
          {([
            ["overview", "运营总览"],
            ["users", "用户与额度"],
            ["vitals", "Web Vitals"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-current={tab === value ? "page" : undefined}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </nav>
        <Link className="admin-back" href="/">返回工作台</Link>
      </header>

      <div className="admin-content">
        {loading ? (
          <div className="admin-state" role="status">
            <i aria-hidden="true" />
            正在读取运营数据
          </div>
        ) : null}
        {error ? <div className="admin-error" role="alert">{error}</div> : null}
        {notice ? <div className="admin-notice" role="status">{notice}</div> : null}

        {tab === "overview" && summary ? (
          <section className="admin-overview" aria-labelledby="overview-title">
            <header className="admin-title-row">
              <div>
                <p className="admin-kicker">LIVE OPERATIONS</p>
                <h1 id="overview-title">运营总览</h1>
              </div>
              <div className="admin-health">
                <b>{successRate}%</b>
                <span>任务成功率</span>
              </div>
            </header>

            <div className="admin-metric-band">
              {metricLabels.map(([key, label]) => (
                <div key={key}>
                  <strong>{summary[key] as number}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <section className="admin-audit" aria-labelledby="audit-title">
              <header>
                <div>
                  <p className="admin-kicker">AUDIT TRAIL</p>
                  <h2 id="audit-title">最近管理操作</h2>
                </div>
                <span>{summary.recentOperations.length} 条</span>
              </header>
              {summary.recentOperations.length > 0 ? (
                <ol>
                  {summary.recentOperations.map((item) => (
                    <li key={item.id}>
                      <b>
                        {item.action === "quota_override_set"
                          ? "设置额度"
                          : item.action === "quota_override_revoke"
                            ? "撤销额度"
                            : item.action}
                      </b>
                      <span>{item.targetUserId}</span>
                      <time>{formatTime(item.createdAt)}</time>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="admin-empty">还没有管理操作。</p>
              )}
            </section>
          </section>
        ) : null}

        {tab === "users" ? (
          <section className="admin-users" aria-labelledby="users-title">
            <header className="admin-title-row">
              <div>
                <p className="admin-kicker">PEOPLE & QUOTA</p>
                <h1 id="users-title">用户与额度</h1>
              </div>
              <form
                className="admin-search"
                onSubmit={(event) => {
                  event.preventDefault()
                  setSearch(query.trim())
                  void loadUsers(query.trim())
                }}
              >
                <label htmlFor="admin-user-search">搜索用户</label>
                <input
                  id="admin-user-search"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="邮箱或用户名"
                  value={query}
                />
                <button type="submit">搜索</button>
              </form>
            </header>

            <div className="admin-user-workbench">
              <div className="admin-user-list">
                {users.length > 0 ? users.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className={user.id === selectedId ? "is-active" : ""}
                    onClick={() => setSelectedId(user.id)}
                  >
                    <span>
                      <b>{user.username}</b>
                      <small>{user.email || "未绑定邮箱"}</small>
                    </span>
                    <span>
                      <b>{user.quota.remaining}</b>
                      <small>剩余额度</small>
                    </span>
                    <span>
                      <b>{user.projectCount}</b>
                      <small>项目</small>
                    </span>
                  </button>
                )) : <p className="admin-empty">没有匹配用户。</p>}
              </div>

              <aside className="admin-quota-panel" aria-label="额度编辑器">
                {selected ? (
                  <>
                    <header>
                      <div>
                        <p className="admin-kicker">QUOTA OVERRIDE</p>
                        <h2>{selected.username}</h2>
                      </div>
                      <span>{selected.id}</span>
                    </header>
                    <dl>
                      <div><dt>注册时间</dt><dd>{formatTime(selected.createdAt)}</dd></div>
                      <div><dt>最近活跃</dt><dd>{formatTime(selected.lastSeenAt)}</dd></div>
                      <div><dt>当前额度</dt><dd>{selected.quota.remaining} / {selected.quota.limit}</dd></div>
                      <div><dt>有效覆盖</dt><dd>{selected.quota.extraUnits} 单位</dd></div>
                      <div><dt>覆盖到期</dt><dd>{formatTime(selected.quota.expiresAt)}</dd></div>
                    </dl>
                    <div className="admin-quota-form">
                      <label>
                        <span>临时额外额度</span>
                        <input
                          min="1"
                          max="100000"
                          onChange={(event) => setExtraUnits(event.target.value)}
                          type="number"
                          value={extraUnits}
                        />
                      </label>
                      <label>
                        <span>有效期</span>
                        <select onChange={(event) => setDays(event.target.value)} value={days}>
                          <option value="1">1 天</option>
                          <option value="7">7 天</option>
                          <option value="30">30 天</option>
                        </select>
                      </label>
                      <label className="is-wide">
                        <span>操作原因</span>
                        <input
                          maxLength={200}
                          onChange={(event) => setReason(event.target.value)}
                          value={reason}
                        />
                      </label>
                      <button
                        className="is-primary"
                        disabled={busy}
                        onClick={() => void submitOverride()}
                        type="button"
                      >
                        {busy ? "保存中" : "保存额度"}
                      </button>
                      <button
                        disabled={busy || selected.quota.extraUnits <= 0}
                        onClick={() => void revokeOverride()}
                        type="button"
                      >
                        撤销额度
                      </button>
                    </div>
                  </>
                ) : <p className="admin-empty">选择用户后管理额度。</p>}
              </aside>
            </div>
          </section>
        ) : null}

        {tab === "vitals" ? (
          <section className="admin-vitals" aria-labelledby="vitals-title">
            <header className="admin-title-row">
              <div>
                <p className="admin-kicker">REAL USER MONITORING</p>
                <h1 id="vitals-title">Web Vitals</h1>
              </div>
              <span className="admin-window">近 7 天</span>
            </header>
            {vitals.length > 0 ? (
              <div className="admin-vitals-table" role="table" aria-label="Web Vitals 分位数">
                <div role="row" className="admin-vitals-head">
                  <span>指标</span><span>路由</span><span>设备</span><span>样本</span>
                  <span>p50</span><span>p75</span><span>p95</span>
                </div>
                {vitals.map((row) => (
                  <div
                    role="row"
                    className="admin-vitals-row"
                    key={`${row.name}-${row.path}-${row.device}`}
                  >
                    <b data-label="指标">{row.name}</b>
                    <code data-label="路由">{row.path}</code>
                    <span data-label="设备">{row.device}</span>
                    <span data-label="样本">{row.samples}</span>
                    <span data-label="p50">{row.p50}</span>
                    <span data-label="p75">{row.p75}</span>
                    <span data-label="p95">{row.p95}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="admin-empty">暂无性能样本。页面开始上报后会显示真实分位数。</p>
            )}
          </section>
        ) : null}
      </div>
    </main>
  )
}
