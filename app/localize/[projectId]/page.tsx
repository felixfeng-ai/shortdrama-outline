'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

import AgentDock from '@/components/AgentDock'
import { buildZip, downloadBlob } from '@/lib/assets/export'
import {
  fetchProjectSkill,
  listProjects,
  listSnapshots,
} from '@/lib/assets/api'
import type {
  AgentCard,
  AgentLocalizationBranch,
  AgentState,
} from '@/lib/agent/tools'
import { EMPTY_BRIEF } from '@/lib/brief'
import {
  analyzeLocalizationVisuals,
  buildLocalizationDelivery,
  commitLocalizationVisuals,
  confirmLocalizedEpisodes,
  createLocalizationBranch,
  fetchLatestLocalizationAudit,
  fetchLocalizationBranches,
  fetchLocalizationCanon,
  fetchLocalizationContext,
  fetchLocalizationGlossary,
  runLocalizationAdaptation,
  runLocalizationAudit,
  saveBranchCanonFact,
  saveLocalizationContext,
  saveLocalizationGlossary,
  type BranchCanonFact,
  type BranchCanonIssue,
  type BranchContext,
  type GlossaryEntry,
  type LocalizationBranch,
  type LocalizedEpisode,
  type MarketProfile,
  type SavedLocalizationAudit,
  type VisualLocalizationSuggestion,
} from '@/lib/localization/client'
import { MARKET_PROFILES } from '@/lib/localization/catalog'
import { splitSubtitleText } from '@/lib/localization/delivery'
import '../localize.css'

interface EpisodeLike {
  id: string
  number: number
  title: string
  synopsis: string
  hook: string
  intensity?: number
  localization?: {
    source?: string
    reason?: string
    glossaryUsed?: string[]
    risks?: string[]
  }
}

interface SnapshotLike {
  id: string
  version: number
  payload: unknown
}

type WorkspaceSection = 'market' | 'adapt' | 'script' | 'bible' | 'captions' | 'visual' | 'delivery'

const SECTIONS: Array<{ id: WorkspaceSection; label: string; hint: string }> = [
  { id: 'market', label: '市场设定', hint: '受众、平台、评级与红线' },
  { id: 'adapt', label: '改编方案', hint: '生成可确认的本地化候选' },
  { id: 'script', label: '剧本对照', hint: '原文与本地方案并排检查' },
  { id: 'bible', label: '术语与 Canon', hint: '锁定译名和市场事实' },
  { id: 'captions', label: '字幕与配音', hint: '阅读速度、句长和时长' },
  { id: 'visual', label: '视觉本地化', hint: '招牌、货币和可读文字' },
  { id: 'delivery', label: '质检与交付', hint: '审计、manifest 和文本包' },
]

function emptyBrief() {
  return {
    audience: '',
    emotion: '',
    strategy: '',
    redlines: '',
  }
}

function defaultSubtitles(profile: MarketProfile) {
  return {
    maxLineChars: profile.subtitle.maxLineChars,
    maxCps: profile.subtitle.maxCps,
    minDurationMs: profile.subtitle.minDurationMs,
    maxDurationMs: profile.subtitle.maxDurationMs,
  }
}

export default function LocalizePage() {
  const params = useParams<{ projectId: string }>()
  const projectId = decodeURIComponent(String(params.projectId || ''))
  const [projectTitle, setProjectTitle] = useState('')
  const [branches, setBranches] = useState<LocalizationBranch[]>([])
  const [activeBranchId, setActiveBranchId] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [sourceSnapshot, setSourceSnapshot] = useState<SnapshotLike | null>(null)
  const [sourceEpisodes, setSourceEpisodes] = useState<EpisodeLike[]>([])
  const [context, setContext] = useState<BranchContext | null>(null)
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([])
  const [canonFacts, setCanonFacts] = useState<BranchCanonFact[]>([])
  const [canonIssues, setCanonIssues] = useState<BranchCanonIssue[]>([])
  const [audit, setAudit] = useState<SavedLocalizationAudit | null>(null)
  const [candidates, setCandidates] = useState<LocalizedEpisode[]>([])
  const [visualSuggestions, setVisualSuggestions] = useState<VisualLocalizationSuggestion[]>([])
  const [section, setSection] = useState<WorkspaceSection>('market')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [projectSkill, setProjectSkill] = useState<Awaited<ReturnType<typeof fetchProjectSkill>>>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [createMarket, setCreateMarket] = useState(MARKET_PROFILES[0].code)
  const [createName, setCreateName] = useState('English')
  const [marketCode, setMarketCode] = useState(MARKET_PROFILES[0].code)
  const [platforms, setPlatforms] = useState<string[]>(MARKET_PROFILES[0].platforms)
  const [rating, setRating] = useState(MARKET_PROFILES[0].defaultRating)
  const [briefDraft, setBriefDraft] = useState(emptyBrief())
  const [subtitleDraft, setSubtitleDraft] = useState(defaultSubtitles(MARKET_PROFILES[0]))
  const [glossaryDraft, setGlossaryDraft] = useState({ source: '', target: '', kind: 'person', locked: true, notes: '' })
  const [canonDraft, setCanonDraft] = useState({
    kind: 'character',
    name: '',
    field: 'preferredName',
    value: '',
    from: 1,
    to: 30,
  })

  const activeBranch = branches.find((branch) => branch.id === activeBranchId) ?? null
  const activeProfile = MARKET_PROFILES.find((profile) => profile.code === marketCode)
    ?? MARKET_PROFILES[0]

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      listProjects().catch(() => []),
      fetchLocalizationBranches(projectId).catch(() => []),
      listSnapshots<EpisodeLike[]>(projectId, 'episodes').catch(() => []),
      fetchProjectSkill(projectId).catch(() => null),
    ]).then(([projects, nextBranches, snapshots, skill]) => {
      if (!active) return
      setProjectTitle(projects.find((project) => project.id === projectId)?.title ?? '当前项目')
      setBranches(nextBranches)
      setProjectSkill(skill)
      const newest = snapshots[0] ?? null
      setSourceSnapshot(newest)
      setSourceEpisodes(Array.isArray(newest?.payload) ? newest.payload : [])
      const queryBranch = new URLSearchParams(window.location.search).get('branch')
      setActiveBranchId(
        nextBranches.find((branch) => branch.id === queryBranch)?.id
        ?? nextBranches[0]?.id
        ?? '',
      )
      setLoading(false)
    })
    return () => {
      active = false
      abortRef.current?.abort()
    }
  }, [projectId])

  useEffect(() => {
    if (!activeBranch) {
      setContext(null)
      setGlossary([])
      setCandidates([])
      setAudit(null)
      return
    }
    let active = true
    setBusy(true)
    setNotice(null)
    Promise.all([
      fetchLocalizationContext(projectId, activeBranch.id),
      fetchLocalizationGlossary(projectId, activeBranch.id),
      fetchLatestLocalizationAudit(projectId, activeBranch.id),
      fetchLocalizationCanon(projectId, activeBranch.id),
      listSnapshots<EpisodeLike[]>(projectId, 'episodes', activeBranch.id).catch(() => []),
    ]).then(([nextContext, nextGlossary, nextAudit, nextCanon, branchSnapshots]) => {
      if (!active) return
      setContext(nextContext)
      setGlossary(nextGlossary)
      setAudit(nextAudit)
      setCanonFacts(nextCanon.facts)
      setCanonIssues(nextCanon.issues)
      const profile = nextContext?.profile
        ?? MARKET_PROFILES.find((item) => item.locale === activeBranch.locale)
        ?? MARKET_PROFILES[0]
      setMarketCode(profile.code)
      setPlatforms(nextContext?.platforms ?? profile.platforms)
      setRating(nextContext?.contentRating ?? profile.defaultRating)
      setBriefDraft(nextContext ? {
        audience: nextContext.adaptationBrief.audience,
        emotion: nextContext.adaptationBrief.emotion,
        strategy: nextContext.adaptationBrief.strategy,
        redlines: nextContext.adaptationBrief.redlines.join('\n'),
      } : emptyBrief())
      setSubtitleDraft(nextContext?.subtitle ?? defaultSubtitles(profile))
      const branchLatest = branchSnapshots[0] ?? null
      if (branchLatest && Array.isArray(branchLatest.payload)) {
        setCandidates((branchLatest.payload as EpisodeLike[]).map((episode) => ({
          episode: episode.number,
          title: episode.title,
          localized: episode.synopsis,
          hook: episode.hook,
          source: episode.localization?.source ?? sourceEpisodes.find((item) => item.number === episode.number)?.synopsis ?? '',
          reason: episode.localization?.reason ?? '来自已保存的本地化快照',
          glossaryUsed: episode.localization?.glossaryUsed ?? [],
          risks: episode.localization?.risks ?? [],
        })))
      } else {
        setCandidates([])
      }
    }).catch((error) => {
      if (active) setNotice(error instanceof Error ? error.message : '海外工作区读取失败')
    }).finally(() => {
      if (active) setBusy(false)
    })
    return () => {
      active = false
    }
  }, [activeBranch?.id, projectId, sourceEpisodes])

  const agentState: AgentState = {
    projectTitle,
    hasIdea: true,
    brief: EMPTY_BRIEF,
    judgments: [],
    decisions: [],
    canonIssues: [],
    episodes: sourceEpisodes.map((episode) => ({
      number: episode.number,
      title: episode.title,
      hook: episode.hook,
    })),
    completed: {
      characters: true,
      acts: true,
      episodes: true,
      visuals: true,
      scenes: true,
      shots: true,
    },
    shots: [],
    expiredShots: 0,
    quota: null,
    skill: projectSkill ? {
      id: projectSkill.skillId,
      name: projectSkill.name,
      version: projectSkill.skillVersion,
      summary: projectSkill.summary,
      stageRules: projectSkill.stageRules,
      acceptance: projectSkill.acceptance,
    } : null,
    localizationBranches: branches.map<AgentLocalizationBranch>((branch) => ({
      id: branch.id,
      name: branch.name,
      market: branch.market,
      locale: branch.locale,
      status: branch.status,
    })),
    localizationContext: context ? {
      branchId: context.branchId,
      market: context.profile.market,
      locale: context.profile.locale,
      platforms: context.platforms,
      audience: context.adaptationBrief.audience,
      strategy: context.adaptationBrief.strategy,
    } : null,
    localizationAudit: audit ? {
      blocking: audit.blocking,
      warning: audit.warning,
      issues: audit.issues.map((issue) => issue.message),
    } : null,
    localizationEntities: sourceEpisodes.map((episode) => ({
      type: 'episode' as const,
      id: episode.id,
      name: `第 ${episode.number} 集 · ${episode.title}`,
    })),
  }

  async function createBranch() {
    if (!sourceSnapshot) {
      setNotice('请先在主工作台生成并保存一版分集')
      return
    }
    const profile = MARKET_PROFILES.find((item) => item.code === createMarket)!
    setBusy(true)
    try {
      const branch = await createLocalizationBranch(projectId, {
        name: createName.trim() || profile.label,
        baseSnapshotId: sourceSnapshot.id,
        market: profile.market,
        locale: profile.locale,
      })
      setBranches((current) => [branch, ...current])
      setActiveBranchId(branch.id)
      setShowCreate(false)
      setNotice(`已创建海外分支：${branch.name}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '海外分支创建失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveContext() {
    if (!activeBranch) return
    setBusy(true)
    try {
      const saved = await saveLocalizationContext(projectId, activeBranch.id, {
        marketCode,
        platforms,
        contentRating: rating,
        adaptationBrief: {
          audience: briefDraft.audience,
          emotion: briefDraft.emotion,
          strategy: briefDraft.strategy,
          redlines: briefDraft.redlines.split('\n').map((line) => line.trim()).filter(Boolean),
        },
        subtitle: subtitleDraft,
        version: context?.version,
      })
      setContext(saved)
      setNotice(`市场设定已保存 · v${saved.version}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '市场设定保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function generateCandidates(resume = false) {
    if (!activeBranch || !sourceSnapshot) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setProgress('正在准备本地化上下文…')
    setNotice(null)
    try {
      await runLocalizationAdaptation(
        projectId,
        activeBranch.id,
        { sourceSnapshotId: sourceSnapshot.id, resume },
        (event, data) => {
          if (event === 'progress') {
            const characters = Number((data as { characters?: number })?.characters ?? 0)
            setProgress(`模型已输出 ${characters.toLocaleString('zh-CN')} 字符…`)
          }
          if (event === 'resume') setProgress('正在从上次断点继续…')
          if (event === 'done') {
            const items = (data as { items?: LocalizedEpisode[] })?.items ?? []
            setCandidates(items)
            setProgress('')
            setNotice(`已生成 ${items.length} 集本地化候选，尚未写入正式版本`)
          }
        },
        controller.signal,
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '本地化生成失败')
      setProgress('')
    } finally {
      setBusy(false)
    }
  }

  async function confirmCandidates() {
    if (!activeBranch || !sourceSnapshot || candidates.length === 0) return
    setBusy(true)
    try {
      const snapshot = await confirmLocalizedEpisodes(projectId, activeBranch.id, {
        sourceSnapshotId: sourceSnapshot.id,
        items: candidates,
      })
      setNotice(`已保存为 ${activeBranch.name} v${snapshot.version}，原始版本未改变`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '本地化版本保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveGlossary() {
    if (!activeBranch) return
    setBusy(true)
    try {
      const entry = await saveLocalizationGlossary(projectId, activeBranch.id, glossaryDraft)
      setGlossary((current) => [...current.filter((item) => item.id !== entry.id), entry].sort((a, b) => a.source.localeCompare(b.source)))
      setGlossaryDraft({ source: '', target: '', kind: 'person', locked: true, notes: '' })
      setNotice(`已保存术语：${entry.source} → ${entry.target}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '术语保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function saveCanonFact() {
    if (!activeBranch) return
    setBusy(true)
    try {
      const fact = await saveBranchCanonFact(projectId, activeBranch.id, {
        kind: canonDraft.kind,
        name: canonDraft.name,
        field: canonDraft.field,
        value: canonDraft.value,
        validFromEpisode: canonDraft.from,
        validToEpisode: canonDraft.to,
      })
      setCanonFacts((current) => [fact, ...current])
      const nextCanon = await fetchLocalizationCanon(projectId, activeBranch.id)
      setCanonIssues(nextCanon.issues)
      setNotice('市场 Canon 已保存')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '市场 Canon 保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function auditCandidates() {
    if (!activeBranch || !sourceSnapshot || candidates.length === 0) return
    setBusy(true)
    try {
      const report = await runLocalizationAudit(projectId, activeBranch.id, {
        sourceSnapshotId: sourceSnapshot.id,
        items: candidates,
      })
      setAudit(report)
      setNotice(`审计完成：${report.blocking} 个阻断，${report.warning} 个提醒`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '本地化审计失败')
    } finally {
      setBusy(false)
    }
  }

  async function analyzeVisuals() {
    if (!activeBranch) return
    setBusy(true)
    try {
      const result = await analyzeLocalizationVisuals(projectId, activeBranch.id)
      setVisualSuggestions(result.suggestions)
      setNotice(result.suggestions.length > 0
        ? `发现 ${result.suggestions.length} 个需要处理的视觉镜头`
        : '没有发现明确的视觉本地化风险')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '视觉检查失败')
    } finally {
      setBusy(false)
    }
  }

  async function commitVisuals() {
    if (!activeBranch || visualSuggestions.length === 0) return
    setBusy(true)
    try {
      const snapshot = await commitLocalizationVisuals(projectId, activeBranch.id, visualSuggestions)
      setNotice(`视觉修正已保存为 ${activeBranch.name} v${snapshot.version}`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '视觉修正保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function downloadDelivery() {
    if (!activeBranch || !sourceSnapshot || candidates.length === 0) return
    setBusy(true)
    try {
      const delivery = await buildLocalizationDelivery(projectId, activeBranch.id, {
        title: projectTitle,
        sourceSnapshotId: sourceSnapshot.id,
        items: candidates,
        visualNotes: visualSuggestions.flatMap((suggestion) =>
          suggestion.issues.map((issue) => `第 ${suggestion.shot} 镜：${issue.message}`)
        ),
      })
      const blob = buildZip(delivery.files.map((file) => ({
        name: file.path,
        data: new TextEncoder().encode(file.content),
      })))
      downloadBlob(`${activeBranch.name}-localization.zip`, blob)
      setNotice('本地化交付包已生成')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '交付包生成失败')
    } finally {
      setBusy(false)
    }
  }

  function applyLocalizationCard(card: Extract<AgentCard, { kind: 'localization-edit' }>) {
    const episode = sourceEpisodes.find((item) => item.id === card.targetId)
    if (!episode) {
      setNotice('这条本地化建议的目标已不存在')
      return
    }
    setCandidates((current) => {
      const item: LocalizedEpisode = {
        episode: episode.number,
        title: episode.title,
        localized: card.text,
        hook: episode.hook,
        source: episode.synopsis,
        reason: card.summary,
        glossaryUsed: [],
        risks: [],
      }
      const exists = current.some((candidate) => candidate.episode === episode.number)
      return exists
        ? current.map((candidate) => candidate.episode === episode.number ? { ...candidate, localized: card.text, reason: card.summary } : candidate)
        : [...current, item].sort((left, right) => left.episode - right.episode)
    })
    setNotice(`已把场记建议应用到第 ${episode.number} 集候选`)
  }

  const subtitlePreview = useMemo(() => {
    if (!activeProfile) return []
    return candidates.flatMap((item) =>
      splitSubtitleText(item.localized, subtitleDraft.maxLineChars)
        .map((line) => ({ episode: item.episode, line }))
    )
  }, [activeProfile, candidates, subtitleDraft.maxLineChars])

  if (loading) {
    return (
      <main className="localize-page localize-loading">
        <span>正在读取海外工作区…</span>
      </main>
    )
  }

  if (branches.length === 0 || showCreate) {
    const profile = MARKET_PROFILES.find((item) => item.code === createMarket)!
    return (
      <main className="localize-page localize-empty">
        <a href={`/?project=${encodeURIComponent(projectId)}&step=episodes`}>返回项目</a>
        <p>LOCALIZATION WORKSPACE</p>
        <h1>建立第一个海外版本</h1>
        <span>原始中文版不会被覆盖。先选择市场和语言，后续再从真实分集版本生成本地化候选。</span>
        <div className="localize-create-card">
          <label>
            <span>目标市场</span>
            <select value={createMarket} onChange={(event) => {
              const next = MARKET_PROFILES.find((item) => item.code === event.target.value)!
              setCreateMarket(next.code)
              setCreateName(next.label)
            }}>
              {MARKET_PROFILES.map((item) => <option key={item.code} value={item.code}>{item.label} · {item.locale}</option>)}
            </select>
          </label>
          <label>
            <span>分支名称</span>
            <input value={createName} onChange={(event) => setCreateName(event.target.value)} />
          </label>
          <div>
            <b>{sourceSnapshot ? `基线：分集 v${sourceSnapshot.version}` : '还没有可用的分集快照'}</b>
            <small>{profile.language} · {profile.platforms.join(' / ')}</small>
          </div>
          <button type="button" disabled={busy || !sourceSnapshot} onClick={() => void createBranch()}>
            {busy ? '创建中…' : '创建海外分支'}
          </button>
          {branches.length > 0 && (
            <button type="button" className="localize-cancel-create" onClick={() => setShowCreate(false)}>
              取消
            </button>
          )}
        </div>
        {notice && <p role="status">{notice}</p>}
      </main>
    )
  }

  return (
    <main className="localize-page">
      <header className="localize-topbar">
        <a className="localize-back" href={`/?project=${encodeURIComponent(projectId)}&step=episodes`}>
          <span aria-hidden="true">←</span>
          <b>工作台</b>
        </a>
        <div className="localize-project-lockup">
          <span className="localize-brand-mark" aria-hidden="true">V</span>
          <div>
            <b>{projectTitle}</b>
            <span>海外本地化 · {activeBranch?.name} / {activeBranch?.locale}</span>
          </div>
        </div>
        <span className={`localize-status ${audit?.blocking ? 'has-blocking' : ''}`}>
          {audit ? `${audit.blocking} 阻断 · ${audit.warning} 提醒` : '尚未审计'}
        </span>
      </header>

      <div className="localize-layout">
        <aside className="localize-sidebar">
          <div className="localize-sidebar-brand">
            <p>MARKETS</p>
            <b>海外工作区</b>
            <span>{branches.length} 个市场版本 · 基线分集 v{sourceSnapshot?.version ?? '-'}</span>
          </div>
          <div className="localize-branches" aria-label="海外市场分支">
            {branches.map((branch) => (
              <button
                key={branch.id}
                type="button"
                className={branch.id === activeBranchId ? 'active' : ''}
                onClick={() => setActiveBranchId(branch.id)}
              >
                <span className="localize-branch-dot" aria-hidden="true" />
                <span>
                  <b>{branch.name}</b>
                  <small>{branch.locale} · {branch.market}</small>
                </span>
              </button>
            ))}
            <button type="button" className="localize-add" onClick={() => setShowCreate(true)}>
              + 新建市场分支
            </button>
          </div>

          <nav className="localize-tabs" aria-label="本地化步骤">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? 'active' : ''}
                aria-current={section === item.id ? 'step' : undefined}
                onClick={() => setSection(item.id)}
              >
                <b>{item.label}</b>
                <span>{item.hint}</span>
              </button>
            ))}
          </nav>

          <div className="localize-sidebar-foot">
            <span>当前市场</span>
            <b>{activeProfile.label}</b>
            <small>{context ? `Context v${context.version}` : 'Context 待保存'}</small>
          </div>
        </aside>

        <section className="localize-content">
          <div className="localize-context-strip" aria-label="当前本地化状态">
            <div>
              <span>目标市场</span>
              <b>{activeProfile.label}</b>
              <small>{activeProfile.locale}</small>
            </div>
            <div>
              <span>本地化分集</span>
              <b>{candidates.length}</b>
              <small>共 {sourceEpisodes.length} 集原文</small>
            </div>
            <div>
              <span>术语与 Canon</span>
              <b>{glossary.length} / {canonFacts.length}</b>
              <small>{canonIssues.length > 0 ? `${canonIssues.length} 项待确认` : '未发现冲突'}</small>
            </div>
            <div className={audit?.blocking ? 'has-blocking' : ''}>
              <span>交付状态</span>
              <b>{audit ? (audit.blocking > 0 ? '需处理' : '可交付') : '未审计'}</b>
              <small>{audit ? `${audit.blocking} 阻断 · ${audit.warning} 提醒` : '先运行本地化审计'}</small>
            </div>
          </div>
          {notice && <p className="localize-notice" role="status" aria-live="polite">{notice}</p>}
          {progress && <p className="localize-progress">{progress}</p>}

          <div className="localize-section-stage" key={section}>
          {section === 'market' && (
            <div className="localize-panel">
              <div className="localize-panel-head">
                <div>
                  <p>MARKET PROFILE</p>
                  <h1>目标市场与改编约束</h1>
                  <span>这些设置决定模型如何理解文化语境、台词长度和目标平台。</span>
                </div>
                <div className="localize-panel-tools">
                  <span className={context ? 'is-saved' : ''}>
                    {context ? `已保存 · v${context.version}` : '尚未保存'}
                  </span>
                  <button type="button" className="primary" disabled={busy} onClick={() => void saveContext()}>保存市场设定</button>
                </div>
              </div>
              <div className="localize-form-grid">
                <label><span>市场</span><select value={marketCode} onChange={(event) => {
                  const profile = MARKET_PROFILES.find((item) => item.code === event.target.value)!
                  setMarketCode(profile.code)
                  setPlatforms(profile.platforms)
                  setRating(profile.defaultRating)
                  setSubtitleDraft(defaultSubtitles(profile))
                }}>{MARKET_PROFILES.map((profile) => <option key={profile.code} value={profile.code}>{profile.label} · {profile.locale}</option>)}</select><small>切换市场会载入默认平台、评级和字幕速度。</small></label>
                <label><span>内容评级</span><input value={rating} onChange={(event) => setRating(event.target.value)} /><small>用于市场红线和内容提示。</small></label>
                <label className="wide"><span>目标平台</span><input value={platforms.join('、')} onChange={(event) => setPlatforms(event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean))} /><small>多个平台用顿号分隔，交付时写入平台规格。</small></label>
                <label><span>目标观众</span><input value={briefDraft.audience} onChange={(event) => setBriefDraft((current) => ({ ...current, audience: event.target.value }))} placeholder="例如：北美 25–35 女性" /><small>谁会被这部剧留下来。</small></label>
                <label><span>核心情绪</span><input value={briefDraft.emotion} onChange={(event) => setBriefDraft((current) => ({ ...current, emotion: event.target.value }))} /><small>观众应持续感到什么。</small></label>
                <label className="wide"><span>改编策略</span><textarea rows={4} value={briefDraft.strategy} onChange={(event) => setBriefDraft((current) => ({ ...current, strategy: event.target.value }))} /><small>写具体改写方法，不写泛泛的风格形容词。</small></label>
                <label className="wide"><span>红线 · 一行一条</span><textarea rows={3} value={briefDraft.redlines} onChange={(event) => setBriefDraft((current) => ({ ...current, redlines: event.target.value }))} /><small>命中后会阻断交付，需要人工确认或改写。</small></label>
              </div>
            </div>
          )}

          {section === 'adapt' && (
            <div className="localize-panel">
              <div className="localize-panel-head">
                <div><p>ADAPTATION</p><h1>生成本地化候选</h1><span>原始分集 v{sourceSnapshot?.version ?? '-'} 只作为基线，候选不会自动写入。</span></div>
                <div className="localize-actions">
                  <button type="button" disabled={busy || !context} onClick={() => void generateCandidates()}>{busy ? '生成中…' : '生成本地化候选'}</button>
                  <button type="button" disabled={busy || !context} onClick={() => void generateCandidates(true)}>继续上次</button>
                </div>
              </div>
              {!context && <p className="localize-warning">先在市场设定中保存 Context，再开始改编。</p>}
              <div className="localize-list">
                {sourceEpisodes.map((episode) => {
                  const candidate = candidates.find((item) => item.episode === episode.number)
                  return (
                    <article key={episode.id}>
                      <header><b>EP {episode.number}</b><strong>{episode.title}</strong><span>{candidate ? '已有候选' : '待生成'}</span></header>
                      <p>{candidate?.localized || episode.synopsis}</p>
                      {candidate?.reason && <small>{candidate.reason}</small>}
                    </article>
                  )
                })}
              </div>
              <div className="localize-footer-actions">
                <button type="button" disabled={busy || candidates.length === 0} onClick={() => void confirmCandidates()}>确认保存为新版本</button>
              </div>
            </div>
          )}

          {section === 'script' && (
            <div className="localize-panel">
              <div className="localize-panel-head"><div><p>BILINGUAL REVIEW</p><h1>原文与本地化方案</h1></div></div>
              <div className="localize-diff-list">
                {sourceEpisodes.map((episode) => {
                  const candidate = candidates.find((item) => item.episode === episode.number)
                  return (
                    <article key={episode.id}>
                      <h3>第 {episode.number} 集 · {episode.title}</h3>
                      <div><span>原文</span><p>{episode.synopsis}</p></div>
                      <div><span>{activeProfile.language}</span><textarea
                        value={candidate?.localized ?? ''}
                        placeholder="先生成本地化候选，或在这里手工填写"
                        onChange={(event) => setCandidates((current) => {
                          const next: LocalizedEpisode = candidate
                            ? { ...candidate, localized: event.target.value }
                            : {
                              episode: episode.number,
                              title: episode.title,
                              localized: event.target.value,
                              hook: episode.hook,
                              source: episode.synopsis,
                              reason: '手工本地化',
                              glossaryUsed: [],
                              risks: [],
                            }
                          return [...current.filter((item) => item.episode !== episode.number), next]
                            .sort((left, right) => left.episode - right.episode)
                        })}
                      /></div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}

          {section === 'bible' && (
            <div className="localize-panel">
              <div className="localize-panel-head"><div><p>LOCALIZATION BIBLE</p><h1>术语与市场 Canon</h1></div></div>
              <div className="localize-bible-grid">
                <section>
                  <h2>锁定术语</h2>
                  <div className="localize-inline-form">
                    <input placeholder="原文" value={glossaryDraft.source} onChange={(event) => setGlossaryDraft((current) => ({ ...current, source: event.target.value }))} />
                    <input placeholder="目标译法" value={glossaryDraft.target} onChange={(event) => setGlossaryDraft((current) => ({ ...current, target: event.target.value }))} />
                    <button type="button" disabled={busy} onClick={() => void saveGlossary()}>保存</button>
                  </div>
                  <div className="localize-rows">
                    {glossary.map((entry) => (
                      <div key={entry.id}><b>{entry.source}</b><span>→</span><strong>{entry.target}</strong><small>{entry.locked ? '锁定' : '可调整'}</small></div>
                    ))}
                  </div>
                </section>
                <section>
                  <h2>市场 Canon</h2>
                  <div className="localize-inline-form four">
                    <input placeholder="实体名" value={canonDraft.name} onChange={(event) => setCanonDraft((current) => ({ ...current, name: event.target.value }))} />
                    <input placeholder="字段" value={canonDraft.field} onChange={(event) => setCanonDraft((current) => ({ ...current, field: event.target.value }))} />
                    <input placeholder="市场值" value={canonDraft.value} onChange={(event) => setCanonDraft((current) => ({ ...current, value: event.target.value }))} />
                    <button type="button" disabled={busy} onClick={() => void saveCanonFact()}>保存</button>
                  </div>
                  <div className="localize-rows">
                    {canonFacts.map((fact) => (
                      <div key={fact.id}><b>{fact.entityName}</b><span>{fact.field}</span><strong>{fact.value}</strong><small>{fact.validFromEpisode}-{fact.validToEpisode} 集</small></div>
                    ))}
                    {canonIssues.map((issue, index) => (
                      <div key={`${issue.code}-${index}`} className={issue.severity}><b>{issue.entityName}</b><span>{issue.field}</span><strong>{issue.message}</strong></div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          )}

          {section === 'captions' && (
            <div className="localize-panel">
              <div className="localize-panel-head"><div><p>SUBTITLES & DUBBING</p><h1>字幕与配音稿</h1></div><span>{subtitlePreview.length} 条字幕</span></div>
              <div className="localize-form-grid compact">
                <label><span>单行上限</span><input type="number" value={subtitleDraft.maxLineChars} onChange={(event) => setSubtitleDraft((current) => ({ ...current, maxLineChars: Number(event.target.value) }))} /></label>
                <label><span>每秒字符</span><input type="number" value={subtitleDraft.maxCps} onChange={(event) => setSubtitleDraft((current) => ({ ...current, maxCps: Number(event.target.value) }))} /></label>
              </div>
              <div className="localize-subtitle-list">
                {subtitlePreview.map((item, index) => (
                  <div key={`${item.episode}-${index}`}><span>EP {item.episode}</span><p>{item.line}</p><small>{item.line.length} 字符</small></div>
                ))}
              </div>
            </div>
          )}

          {section === 'visual' && (
            <div className="localize-panel">
              <div className="localize-panel-head">
                <div><p>VISUAL LOCALIZATION</p><h1>视觉本地化</h1><span>中文招牌、货币和手机 UI 风险不会自动写回。</span></div>
                <div className="localize-actions">
                  <button type="button" disabled={busy || !context} onClick={() => void analyzeVisuals()}>检查当前分镜</button>
                  <button type="button" disabled={busy || visualSuggestions.length === 0} onClick={() => void commitVisuals()}>确认视觉修正</button>
                </div>
              </div>
              <div className="localize-visual-list">
                {visualSuggestions.map((suggestion) => (
                  <article key={`${suggestion.entityId}-${suggestion.shot}`}>
                    <header><b>第 {suggestion.shot} 镜 · EP {suggestion.episode}</b><span>{suggestion.issues.length} 个风险</span></header>
                    <p>{suggestion.suggestedPrompt}</p>
                    <div>{suggestion.issues.map((issue) => <small key={issue.code}>{issue.message}</small>)}</div>
                  </article>
                ))}
                {visualSuggestions.length === 0 && <p className="localize-empty-state">还没有视觉检查结果。</p>}
              </div>
            </div>
          )}

          {section === 'delivery' && (
            <div className="localize-panel">
              <div className="localize-panel-head">
                <div><p>QUALITY & DELIVERY</p><h1>质检与交付</h1><span>先审术语、字幕和 Canon，再生成字幕、配音稿和 manifest。</span></div>
                <div className="localize-actions">
                  <button type="button" disabled={busy || candidates.length === 0} onClick={() => void auditCandidates()}>运行审计</button>
                  <button type="button" disabled={busy || candidates.length === 0} onClick={() => void downloadDelivery()}>下载交付包</button>
                </div>
              </div>
              <div className="localize-audit-summary">
                <div><b>{audit?.blocking ?? 0}</b><span>阻断项</span></div>
                <div><b>{audit?.warning ?? 0}</b><span>提醒项</span></div>
                <div><b>{candidates.length}</b><span>本地化分集</span></div>
                <div><b>{glossary.length}</b><span>锁定术语</span></div>
              </div>
              <div className="localize-audit-list">
                {audit?.issues.map((issue, index) => (
                  <article key={`${issue.code}-${index}`} className={issue.severity}>
                    <header><b>{issue.severity === 'blocking' ? '阻断' : '提醒'} · {issue.code}</b><span>{issue.episode ? `EP ${issue.episode}` : '全局'}</span></header>
                    <p>{issue.message}</p>
                    <small>{issue.suggestion}</small>
                  </article>
                ))}
                {!audit && <p className="localize-empty-state">还没有审计结果。</p>}
              </div>
            </div>
          )}
          </div>
        </section>
      </div>

      <AgentDock
        variant="floating"
        state={agentState}
        open={agentOpen}
        onOpenChange={setAgentOpen}
        projectId={projectId}
        context={activeBranch ? `${activeBranch.name} · ${activeBranch.locale}` : '海外本地化'}
        onApplyCard={() => ({
          ok: false,
          message: '请回到主工作台确认镜头修改，本地化工作区不会覆盖原文。',
        })}
        onApplyEntityCard={async () => ({
          ok: false,
          message: '请回到主工作台确认实体修改，本地化工作区不会覆盖原文。',
        })}
        onApplyLocalization={applyLocalizationCard}
        onApplyDecision={() => {}}
        onRegenerate={() => {}}
      />
    </main>
  )
}
