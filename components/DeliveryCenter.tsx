'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import VeyaBrandMark from './VeyaBrandMark'
import {
  addPublishMetric,
  createDeliveryPackage,
  createDeliveryReviewLink,
  createPublishRecord,
  fetchDeliveryPackages,
  type DeliveryPackageClient,
} from '@/lib/delivery/client'

interface ProjectLite {
  id: string
  title: string
}

interface RenderLite {
  id: string
  episode: number
  timelineRevision: number
  qualityProfile: 'preview' | 'delivery'
  exportPreset: 'vertical' | 'landscape' | 'square'
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  durationMs: number | null
  createdAt: number
}

const PLATFORM_OPTIONS = [
  ['douyin', '抖音'],
  ['kuaishou', '快手'],
  ['wechat', '视频号'],
  ['tiktok', 'TikTok'],
  ['reels', 'Instagram Reels'],
  ['shorts', 'YouTube Shorts'],
  ['bilibili', 'B站'],
  ['youtube', 'YouTube'],
] as const

const ROLE_OPTIONS = ['导演', '制片', '编剧', '客户', '发布运营'] as const

function statusLabel(status: DeliveryPackageClient['status']): string {
  if (status === 'queued') return '排队中'
  if (status === 'running') return '生成中'
  if (status === 'ready') return '可交付'
  return '生成失败'
}

function formatDate(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function percent(value: unknown): string {
  const number = Number(value)
  return Number.isFinite(number) ? `${Math.round(Math.max(0, Math.min(1, number)) * 100)}%` : '—'
}

export default function DeliveryCenter({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectLite | null>(null)
  const [renders, setRenders] = useState<RenderLite[]>([])
  const [packages, setPackages] = useState<DeliveryPackageClient[]>([])
  const [scope, setScope] = useState<'episode' | 'series'>('episode')
  const [platform, setPlatform] = useState('douyin')
  const [subtitleMode, setSubtitleMode] = useState<'sidecar' | 'burned' | 'both'>('both')
  const [title, setTitle] = useState('')
  const [selectedEpisodes, setSelectedEpisodes] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const deliveryRenders = useMemo(() => {
    const byEpisode = new Map<number, RenderLite>()
    for (const render of [...renders]
      .filter((item) => item.status === 'succeeded' && item.qualityProfile === 'delivery')
      .sort((left, right) => right.createdAt - left.createdAt)) {
      if (!byEpisode.has(render.episode)) byEpisode.set(render.episode, render)
    }
    return [...byEpisode.values()].sort((left, right) => left.episode - right.episode)
  }, [renders])

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const [projectsResponse, rendersResponse, packageRows] = await Promise.all([
        fetch('/api/projects', { cache: 'no-store' }).then((response) => response.json()),
        fetch(`/api/video/renders?projectId=${encodeURIComponent(projectId)}`, {
          cache: 'no-store',
        }).then((response) => response.json()),
        fetchDeliveryPackages(projectId),
      ])
      if (!projectsResponse?.success || !rendersResponse?.success) {
        throw new Error(projectsResponse?.error || rendersResponse?.error || '项目数据读取失败')
      }
      const currentProject = (projectsResponse.data.projects as ProjectLite[])
        .find((item) => item.id === projectId)
      if (!currentProject) throw new Error('项目不存在或无权访问')
      setProject(currentProject)
      setRenders(rendersResponse.data.renders as RenderLite[])
      setPackages(packageRows)
      setError('')
      setSelectedEpisodes((current) => {
        const available = new Set(
          rendersResponse.data.renders
            .filter((render: RenderLite) =>
              render.status === 'succeeded' && render.qualityProfile === 'delivery'
            )
            .map((render: RenderLite) => render.episode),
        )
        const kept = current.filter((episode) => available.has(episode))
        if (kept.length > 0) return kept
        const latest = rendersResponse.data.renders
          .filter((render: RenderLite) => render.status === 'succeeded' && render.qualityProfile === 'delivery')
          .sort((left: RenderLite, right: RenderLite) => right.createdAt - left.createdAt)[0]
        return latest ? [latest.episode] : []
      })
      setTitle((current) => current || `${currentProject.title} 交付包`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '交付中心读取失败')
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!packages.some((pkg) => pkg.status === 'queued' || pkg.status === 'running')) return
    const timer = window.setInterval(() => {
      void refresh(true)
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [packages, refresh])

  async function submitPackage() {
    if (!project || busy) return
    const selectedRenders = deliveryRenders.filter((render) =>
      selectedEpisodes.includes(render.episode)
    )
    if (selectedRenders.length === 0) {
      setError('请先选择至少一集交付版渲染')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const pkg = await createDeliveryPackage({
        projectId,
        title: title.trim() || `${project.title} 交付包`,
        scope,
        platform,
        subtitleMode,
        items: selectedRenders.map((render) => ({
          episode: render.episode,
          renderId: render.id,
        })),
        idempotencyKey: `${projectId}:${platform}:${subtitleMode}:${selectedRenders.map((item) => `${item.episode}:${item.id}`).join('|')}`,
      })
      setPackages((current) => [pkg, ...current.filter((item) => item.id !== pkg.id)])
      setNotice('交付包已加入本地媒体队列，完成后会自动刷新。')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '交付包创建失败')
    } finally {
      setBusy(false)
    }
  }

  function toggleEpisode(episode: number) {
    setSelectedEpisodes((current) => {
      if (scope === 'episode') return [episode]
      return current.includes(episode)
        ? current.filter((item) => item !== episode)
        : [...current, episode].sort((left, right) => left - right)
    })
  }

  return (
    <main className="delivery-shell">
      <header className="delivery-topbar">
        <a href="/" className="delivery-brand" aria-label="返回 VeyaTV 工作台">
          <span><VeyaBrandMark /></span>
          <b>VeyaTV</b>
          <em>交付中心</em>
        </a>
        <a className="delivery-back" href={`/?project=${encodeURIComponent(projectId)}&step=shots`}>
          返回项目
        </a>
      </header>

      <section className="delivery-hero">
        <div>
          <p>DELIVERY & PUBLISH</p>
          <h1>{project?.title ?? '项目交付'}</h1>
          <span>把已完成的交付版成片转换为可直接审片、下载和发布的文件包。</span>
        </div>
        <div className="delivery-hero-status">
          <b>{packages.filter((pkg) => pkg.status === 'ready').length}</b>
          <span>可用交付包</span>
        </div>
      </section>

      {error && <p className="delivery-alert is-error" role="alert">{error}</p>}
      {notice && <p className="delivery-alert is-success" role="status">{notice}</p>}

      <section className="delivery-builder" aria-label="创建交付包">
        <header>
          <div>
            <span>01 / PACKAGE</span>
            <h2>创建发布包</h2>
          </div>
          <small>只使用已完成的交付版渲染，不重新生成镜头视频</small>
        </header>

        <div className="delivery-builder-grid">
          <label>
            <span>交付名称</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>交付范围</span>
            <select value={scope} onChange={(event) => {
              const next = event.target.value as 'episode' | 'series'
              setScope(next)
              if (next === 'episode') setSelectedEpisodes((current) => current.slice(0, 1))
            }}>
              <option value="episode">单集</option>
              <option value="series">整季</option>
            </select>
          </label>
          <label>
            <span>发布平台</span>
            <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {PLATFORM_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>字幕交付</span>
            <select
              value={subtitleMode}
              onChange={(event) => setSubtitleMode(event.target.value as typeof subtitleMode)}
            >
              <option value="both">烧录版 + 旁挂字幕</option>
              <option value="burned">仅烧录版</option>
              <option value="sidecar">仅旁挂 SRT</option>
            </select>
          </label>
        </div>

        <div className="delivery-episode-picker">
          <div>
            <b>选择交付版本</b>
            <span>每集默认使用最新交付版渲染</span>
          </div>
          <div className="delivery-episode-list">
            {deliveryRenders.length === 0 ? (
              <p>还没有交付版成片。先在分镜页渲染 1080P 交付版。</p>
            ) : deliveryRenders.map((render) => (
              <button
                key={render.id}
                type="button"
                className={selectedEpisodes.includes(render.episode) ? 'is-selected' : ''}
                onClick={() => toggleEpisode(render.episode)}
              >
                <b>第 {render.episode} 集</b>
                <span>v{render.timelineRevision} · {render.exportPreset === 'vertical' ? '竖屏' : render.exportPreset === 'landscape' ? '横屏' : '方形'}</span>
                <em>{render.durationMs ? `${(render.durationMs / 1_000).toFixed(1)}s` : '时长未知'}</em>
              </button>
            ))}
          </div>
        </div>

        <footer>
          <span>{selectedEpisodes.length} 集已选择</span>
          <button type="button" disabled={busy || loading || selectedEpisodes.length === 0} onClick={() => void submitPackage()}>
            {busy ? '创建中…' : '创建交付包'}
          </button>
        </footer>
      </section>

      <section className="delivery-packages" aria-label="交付包列表">
        <header>
          <div>
            <span>02 / REVIEW & PUBLISH</span>
            <h2>交付记录</h2>
          </div>
          <button type="button" onClick={() => void refresh()}>刷新状态</button>
        </header>
        {loading ? (
          <p className="delivery-empty">正在读取交付记录…</p>
        ) : packages.length === 0 ? (
          <p className="delivery-empty">还没有交付包。选择已完成的交付版成片开始创建。</p>
        ) : packages.map((pkg) => (
          <DeliveryPackageCard
            key={pkg.id}
            projectId={projectId}
            pkg={pkg}
            onChanged={() => void refresh(true)}
          />
        ))}
      </section>
    </main>
  )
}

function DeliveryPackageCard({
  projectId,
  pkg,
  onChanged,
}: {
  projectId: string
  pkg: DeliveryPackageClient
  onChanged: () => void
}) {
  const [reviewerName, setReviewerName] = useState('')
  const [roleLabel, setRoleLabel] = useState<string>('导演')
  const [reviewUrl, setReviewUrl] = useState('')
  const [publishItemId, setPublishItemId] = useState(pkg.items[0]?.id ?? '')
  const [publishUrl, setPublishUrl] = useState('')
  const [publishNote, setPublishNote] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const firstItem = pkg.items[0]
  const metadata = firstItem?.metadata ?? {}
  const hashtags = Array.isArray(metadata.hashtags) ? metadata.hashtags as string[] : []
  const readiness = metadata.readiness as { ready?: boolean; issues?: Array<{ message: string }> } | undefined

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      setNotice(`${label}已复制`)
    } catch {
      setError('浏览器未允许复制，请手动选择文本')
    }
  }

  async function createReview() {
    if (!reviewerName.trim() || working) return
    setWorking(true)
    setError('')
    try {
      const result = await createDeliveryReviewLink({
        projectId,
        packageId: pkg.id,
        reviewerName: reviewerName.trim(),
        roleLabel,
      })
      setReviewUrl(`${window.location.origin}${result.reviewUrl}`)
      setNotice('审片链接已生成。链接只展示一次，请现在发送。')
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '审片链接生成失败')
    } finally {
      setWorking(false)
    }
  }

  async function submitPublish() {
    if (!publishItemId || working) return
    setWorking(true)
    setError('')
    try {
      await createPublishRecord({
        projectId,
        packageId: pkg.id,
        itemId: publishItemId,
        platform: pkg.platform,
        status: publishUrl.trim() ? 'published' : 'ready',
        publishedUrl: publishUrl.trim(),
        note: publishNote.trim(),
      })
      setNotice(publishUrl.trim() ? '发布记录已写入台账。' : '发布准备记录已保存。')
      setPublishUrl('')
      setPublishNote('')
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '发布记录保存失败')
    } finally {
      setWorking(false)
    }
  }

  async function addMetrics(recordId: string, form: HTMLFormElement) {
    if (working) return
    const data = new FormData(form)
    setWorking(true)
    setError('')
    try {
      await addPublishMetric({
        projectId,
        packageId: pkg.id,
        recordId,
        views: Number(data.get('views')) || 0,
        views3s: Number(data.get('views3s')) || 0,
        completionRate: (Number(data.get('completionRate')) || 0) / 100,
        likes: Number(data.get('likes')) || 0,
        comments: Number(data.get('comments')) || 0,
        shares: Number(data.get('shares')) || 0,
        costUnits: Number(data.get('costUnits')) || 0,
      })
      setNotice('播放数据已回填。')
      form.reset()
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '播放数据保存失败')
    } finally {
      setWorking(false)
    }
  }

  return (
    <article className={`delivery-package is-${pkg.status}`}>
      <header>
        <div>
          <span className={`delivery-status is-${pkg.status}`}>{statusLabel(pkg.status)}</span>
          <h3>{pkg.title}</h3>
          <p>
            {String(pkg.platformProfile.label ?? pkg.platform)}
            {' · '}
            {pkg.scope === 'series' ? '整季' : '单集'}
            {' · '}
            {pkg.items.length} 集 · {formatDate(pkg.createdAt)}
          </p>
        </div>
        <div className="delivery-package-actions">
          {pkg.packageUrl && <a href={pkg.packageUrl} download>下载交付包</a>}
          {pkg.manifestUrl && <a href={pkg.manifestUrl} download>manifest</a>}
        </div>
      </header>

      {pkg.status === 'running' || pkg.status === 'queued' ? (
        <div className="delivery-progress">
          <i style={{ width: `${pkg.progress}%` }} />
          <span>{pkg.progress}% · 正在生成字幕版、封面和 ZIP</span>
        </div>
      ) : null}
      {pkg.error && <p className="delivery-alert is-error">{pkg.error}</p>}
      {error && <p className="delivery-alert is-error">{error}</p>}
      {notice && <p className="delivery-alert is-success">{notice}</p>}

      {pkg.status === 'ready' && (
        <>
          <section className="delivery-publish-prep">
            <div>
              <span>发布准备</span>
              <h4>{String(metadata.title ?? pkg.title)}</h4>
              <p>{String(metadata.description ?? '')}</p>
              <div className="delivery-tags">
                {hashtags.map((tag) => <b key={tag}>#{tag}</b>)}
              </div>
              <small className={readiness?.ready ? 'is-ready' : 'is-warning'}>
                {readiness?.ready
                  ? '平台预检通过'
                  : readiness?.issues?.[0]?.message ?? '请检查平台规格'}
              </small>
            </div>
            <div className="delivery-copy-actions">
              <button type="button" onClick={() => void copy(String(metadata.title ?? ''), '标题')}>复制标题</button>
              <button type="button" onClick={() => void copy(String(metadata.description ?? ''), '简介')}>复制简介</button>
              <button type="button" onClick={() => void copy(hashtags.map((tag) => `#${tag}`).join(' '), '话题')}>复制话题</button>
              <button type="button" onClick={() => void copy(String(metadata.aiDisclosure ?? ''), 'AI 声明')}>复制声明</button>
              {typeof pkg.platformProfile.uploadUrl === 'string' && (
                <a href={pkg.platformProfile.uploadUrl} target="_blank" rel="noreferrer">
                  打开{String(pkg.platformProfile.label ?? pkg.platform)}上传页
                </a>
              )}
            </div>
          </section>

          <section className="delivery-items">
            {pkg.items.map((item) => (
              <div key={item.id} className="delivery-item">
                <video controls preload="metadata" src={item.publishVideoUrl} />
                <div>
                  <b>第 {item.episode} 集</b>
                  <span>烧录字幕 + 封面 + SRT / ASS + metadata</span>
                  <div>
                    <a href={item.publishVideoUrl} download>发布版 MP4</a>
                    <a href={item.cleanVideoUrl} download>干净版</a>
                    <a href={item.srtUrl} download>SRT</a>
                    <a href={item.coverUrl} download>封面</a>
                  </div>
                </div>
              </div>
            ))}
          </section>

          <section className="delivery-review-create">
            <div>
              <span>轻量审片</span>
              <h4>分享给导演、制片或客户</h4>
              <p>对方无需登录，只能看到当前交付包和时间点批注。</p>
            </div>
            <div className="delivery-inline-form">
              <input
                aria-label="审片人称呼"
                placeholder="对方称呼"
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
              />
              <select
                aria-label="审片角色标签"
                value={roleLabel}
                onChange={(event) => setRoleLabel(event.target.value)}
              >
                {ROLE_OPTIONS.map((role) => <option key={role}>{role}</option>)}
              </select>
              <button type="button" disabled={working || !reviewerName.trim()} onClick={() => void createReview()}>
                生成审片链接
              </button>
            </div>
            {reviewUrl && (
              <div className="delivery-review-link">
                <input readOnly value={reviewUrl} aria-label="审片链接" />
                <button type="button" onClick={() => void copy(reviewUrl, '审片链接')}>复制链接</button>
              </div>
            )}
          </section>

          <section className="delivery-publish-record">
            <div>
              <span>发布记录</span>
              <h4>记录真实发布结果</h4>
              <p>平台自动发布尚未接入时，这里保存官方上传后的作品链接。</p>
            </div>
            <div className="delivery-inline-form">
              <select
                aria-label="发布交付项"
                value={publishItemId}
                onChange={(event) => setPublishItemId(event.target.value)}
              >
                {pkg.items.map((item) => (
                  <option key={item.id} value={item.id}>第 {item.episode} 集</option>
                ))}
              </select>
              <input
                aria-label="作品链接"
                placeholder="发布后粘贴作品链接"
                value={publishUrl}
                onChange={(event) => setPublishUrl(event.target.value)}
              />
              <input
                aria-label="发布备注"
                placeholder="备注，可选"
                value={publishNote}
                onChange={(event) => setPublishNote(event.target.value)}
              />
              <button type="button" disabled={working} onClick={() => void submitPublish()}>
                保存发布记录
              </button>
            </div>
          </section>

          {pkg.publishRecords.length > 0 && (
            <section className="delivery-publish-records">
              <header>
                <b>已记录发布</b>
                <span>{pkg.publishSummary.totalViews ?? 0} 播放 · 3 秒留存 {percent(pkg.publishSummary.weightedRetention3s)}</span>
              </header>
              {pkg.publishRecords.map((record) => {
                const recordId = String(record.id ?? '')
                const metrics = Array.isArray(record.metrics) ? record.metrics as Array<Record<string, unknown>> : []
                return (
                  <article key={recordId}>
                    <div>
                      <b>{String(record.platform ?? pkg.platform)} · {String(record.status ?? 'ready')}</b>
                      {typeof record.publishedUrl === 'string' && record.publishedUrl && (
                        <a href={record.publishedUrl} target="_blank" rel="noreferrer">查看作品</a>
                      )}
                      <span>{metrics[0] ? `${metrics[0].views ?? 0} 播放 · 完播 ${percent(metrics[0].completionRate)}` : '尚未回填播放数据'}</span>
                    </div>
                    <form onSubmit={(event) => {
                      event.preventDefault()
                      void addMetrics(recordId, event.currentTarget)
                    }}>
                      <input name="views" type="number" min="0" placeholder="播放" />
                      <input name="views3s" type="number" min="0" placeholder="3秒播放" />
                      <input name="completionRate" type="number" min="0" max="100" placeholder="完播率%" />
                      <input name="likes" type="number" min="0" placeholder="点赞" />
                      <input name="comments" type="number" min="0" placeholder="评论" />
                      <input name="shares" type="number" min="0" placeholder="分享" />
                      <input name="costUnits" type="number" min="0" placeholder="制作额度" />
                      <button type="submit" disabled={working}>回填数据</button>
                    </form>
                  </article>
                )
              })}
            </section>
          )}
        </>
      )}
    </article>
  )
}
