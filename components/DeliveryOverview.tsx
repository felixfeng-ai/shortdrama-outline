'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import VeyaBrandMark from './VeyaBrandMark'
import VeyaWordmark from './VeyaWordmark'
import { fetchDeliveryOverview } from '@/lib/delivery/client'
import type {
  DeliveryOverview,
  DeliveryOverviewPackage,
  DeliveryOverviewProject,
} from '@/lib/delivery/overview'
import type { DeliveryPackageStatus } from '@/lib/delivery/types'

type StatusFilter = 'all' | DeliveryPackageStatus

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'queued', label: '排队' },
  { value: 'running', label: '生成中' },
  { value: 'ready', label: '可交付' },
  { value: 'failed', label: '失败' },
]

function formatDate(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function packageStatusLabel(status: DeliveryPackageStatus): string {
  if (status === 'queued') return '排队中'
  if (status === 'running') return '生成中'
  if (status === 'ready') return '可交付'
  return '生成失败'
}

function projectStatus(project: DeliveryOverviewProject): {
  label: string
  tone: 'ready' | 'running' | 'failed' | 'idle'
} {
  if (project.statusCounts.failed > 0) return { label: '需要处理', tone: 'failed' }
  if (project.statusCounts.running + project.statusCounts.queued > 0) {
    return { label: '正在生成', tone: 'running' }
  }
  if (project.statusCounts.ready > 0) return { label: '可交付', tone: 'ready' }
  return { label: '未开始', tone: 'idle' }
}

export default function DeliveryOverview() {
  const [overview, setOverview] = useState<DeliveryOverview | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setOverview(await fetchDeliveryOverview())
      setError('')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '交付项目读取失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const filteredProjects = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return (overview?.projects ?? []).filter((item) => {
      if (statusFilter !== 'all' && item.statusCounts[statusFilter] === 0) return false
      if (!keyword) return true
      return item.project.title.toLowerCase().includes(keyword)
        || item.latestPackages.some((pkg) => pkg.title.toLowerCase().includes(keyword))
    })
  }, [overview, query, statusFilter])

  const totals = overview?.totals

  return (
    <main className="delivery-shell delivery-overview-shell">
      <header className="delivery-topbar">
        <a href="/" className="delivery-brand" aria-label="返回 VeyaTV 工作台">
          <span><VeyaBrandMark /></span>
          <VeyaWordmark />
          <em>交付中心</em>
        </a>
        <div className="delivery-topbar-actions">
          <a className="delivery-back" href="/">返回工作台</a>
        </div>
      </header>

      <section className="delivery-hero delivery-overview-hero">
        <div>
          <p>DELIVERY &amp; PUBLISH</p>
          <h1>交付中心</h1>
          <span>跨项目查看交付版本、审片进度、发布记录和播放数据。</span>
        </div>
        <div className="delivery-overview-metrics" aria-label="全部项目交付汇总">
          <div>
            <b>{totals?.projectsWithDelivery ?? 0}</b>
            <span>交付项目</span>
          </div>
          <div>
            <b>{totals?.runningPackages ?? 0}</b>
            <span>生成中</span>
          </div>
          <div>
            <b>{totals?.readyPackages ?? 0}</b>
            <span>可交付包</span>
          </div>
          <div>
            <b>{(totals?.totalViews ?? 0).toLocaleString('zh-CN')}</b>
            <span>累计播放</span>
          </div>
        </div>
      </section>

      <section className="delivery-overview-toolbar" aria-label="筛选交付项目">
        <label className="delivery-overview-search">
          <span>搜索项目</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入项目名或交付包名称"
          />
        </label>
        <div className="delivery-overview-filters" role="group" aria-label="交付状态">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={statusFilter === filter.value ? 'is-active' : ''}
              aria-pressed={statusFilter === filter.value}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
              {filter.value !== 'all' && totals && (
                <span>
                  {filter.value === 'queued'
                    ? totals.queuedPackages
                    : filter.value === 'running'
                      ? totals.runningPackages
                      : filter.value === 'ready'
                        ? totals.readyPackages
                        : totals.failedPackages}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          className="delivery-overview-refresh"
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
        >
          {loading ? '读取中' : '刷新'}
        </button>
      </section>

      {error && <p className="delivery-alert is-error" role="alert">{error}</p>}

      <section className="delivery-overview-list" aria-label="全部交付项目">
        <header>
          <div>
            <span>PROJECTS</span>
            <h2>全部交付项目</h2>
          </div>
          <small>
            {loading
              ? '正在读取项目交付状态'
              : `${filteredProjects.length} 个项目 · ${totals?.totalPackages ?? 0} 个交付包`}
          </small>
        </header>

        {loading && !overview ? (
          <p className="delivery-empty">正在读取全部项目交付状态...</p>
        ) : filteredProjects.length === 0 ? (
          <p className="delivery-empty">
            {query || statusFilter !== 'all'
              ? '没有符合当前条件的交付项目。'
              : '还没有项目。先从工作台创建项目并完成一集交付版成片。'}
          </p>
        ) : filteredProjects.map((project) => (
          <DeliveryProjectRow key={project.project.id} project={project} />
        ))}
      </section>
    </main>
  )
}

function DeliveryProjectRow({ project }: { project: DeliveryOverviewProject }) {
  const status = projectStatus(project)
  const projectHref = `/delivery/${encodeURIComponent(project.project.id)}`

  return (
    <article className="delivery-overview-project">
      <header>
        <div>
          <span className={`delivery-overview-project-status is-${status.tone}`}>
            {status.label}
          </span>
          <h3>{project.project.title}</h3>
          <p>
            最后更新 {formatDate(project.project.updatedAt)}
            {' · '}
            {project.summary.totalPackages} 个交付包
            {' · '}
            {project.summary.publishedEpisodes} 集已发布
          </p>
        </div>
        <div className="delivery-overview-project-actions">
          <a
            className="is-secondary"
            href={`/?project=${encodeURIComponent(project.project.id)}&step=shots`}
          >
            打开项目
          </a>
          <a href={projectHref}>进入项目交付</a>
        </div>
      </header>

      <div className="delivery-overview-project-summary">
        <div><b>{project.statusCounts.ready}</b><span>可交付</span></div>
        <div><b>{project.statusCounts.running + project.statusCounts.queued}</b><span>生成中</span></div>
        <div><b>{project.summary.approvedEpisodes}</b><span>审片通过</span></div>
        <div><b>{project.summary.totalViews.toLocaleString('zh-CN')}</b><span>累计播放</span></div>
      </div>

      <div className="delivery-overview-packages">
        {project.latestPackages.length === 0 ? (
          <div className="delivery-overview-no-package">
            <span>尚未创建交付包</span>
            <a href={projectHref}>进入项目创建</a>
          </div>
        ) : project.latestPackages.map((pkg) => (
          <DeliveryPackageRow key={pkg.id} pkg={pkg} href={projectHref} />
        ))}
      </div>
    </article>
  )
}

function DeliveryPackageRow({
  pkg,
  href,
}: {
  pkg: DeliveryOverviewPackage
  href: string
}) {
  return (
    <a className="delivery-overview-package" href={href}>
      <span className={`delivery-status is-${pkg.status}`}>
        {packageStatusLabel(pkg.status)}
      </span>
      <div>
        <b>{pkg.title}</b>
        <small>
          {pkg.platformLabel}
          {' · '}
          {pkg.scope === 'series' ? '整季' : '单集'}
          {' · '}
          {pkg.episodeCount} 集
        </small>
      </div>
      <em>
        {pkg.status === 'running'
          ? `${pkg.progress}%`
          : formatDate(pkg.updatedAt)}
      </em>
    </a>
  )
}
