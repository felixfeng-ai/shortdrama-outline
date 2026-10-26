'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ActList from '@/components/ActList'
import CharacterList from '@/components/CharacterList'
import AttachReview from '@/components/AttachReview'
import EpisodeList from '@/components/EpisodeList'
import EpisodeCountPicker from '@/components/EpisodeCountPicker'
import IdeaPanel from '@/components/IdeaPanel'
import StepSection from '@/components/StepSection'
import StepPills from '@/components/StepPills'
import SideNav from '@/components/SideNav'
import SignalOverview from '@/components/SignalOverview'
import AssistantDock from '@/components/AssistantDock'
import QuotaBar from '@/components/QuotaBar'
import ProjectBar from '@/components/ProjectBar'
import GenerationTaskPanel from '@/components/GenerationTaskPanel'
import PwaInstallButton from '@/components/PwaInstallButton'
import PushNotificationButton from '@/components/PushNotificationButton'
import AuthButton from '@/components/AuthButton'
import ReleaseNotice from '@/components/ReleaseNotice'
import BriefCard from '@/components/BriefCard'
import JudgmentLogPanel from '@/components/JudgmentLogPanel'
import LookBookCard from '@/components/LookBookCard'
import VariantPicker from '@/components/VariantPicker'
import PacingCurve from '@/components/PacingCurve'
import WorkMeta, { type MetaPanel } from '@/components/WorkMeta'
import TodoPanel from '@/components/TodoPanel'
import ProjectCanvas, { type CanvasNodeId, type CanvasPreview } from '@/components/ProjectCanvas'
import { buildTodoList } from '@/lib/todo'
import {
  DEFAULT_EPISODE_COUNT,
  MIN_EPISODE_COUNT,
  clampEpisodeCount,
  episodeQuotaUnits,
  episodeTimeEstimate,
} from '@/lib/episodes'
import { EMPTY_BRIEF, briefSignature, isBriefEmpty, readBrief, type CreativeBrief } from '@/lib/brief'
import { appendJudgment, readJudgments, type JudgmentEntry } from '@/lib/judgment-log'
import { EMPTY_LOOK, lookSignature, readLook, type LookBook } from '@/lib/look'
import { buildProjectStatus } from '@/lib/project-status'
import AgentDock from '@/components/AgentDock'
import type { AgentState } from '@/lib/agent/tools'
import ShotList from '@/components/ShotList'
import SceneList from '@/components/SceneList'
import VisualAnchorPanel from '@/components/VisualAnchorPanel'
import PlacePanel from '@/components/PlacePanel'
import VaultPanel from '@/components/VaultPanel'
import VersionBar from '@/components/VersionBar'
import CopyButton from '@/components/CopyButton'
import {
  createProject,
  listProjects,
  renameProject,
  deleteProject,
  fetchQuota,
  loadSampleProject,
  generateVisuals,
  generateScenes,
  registerRefs,
  listSnapshots,
  listRefs,
  saveSnapshot,
  findImpact,
} from '@/lib/assets/api'
import type { Shot, VisualCharacter, VisualPlace, Scene as AssetScene } from '@/lib/assets/types'
import { groupAttachments } from '@/lib/assets/attachments'
import { backfillVisualCharacterEntityIds } from '@/lib/assets/normalize'
import type { ProjectDto } from '@/lib/assets/api'
import { ARTIFACT_KINDS, type ArtifactKind } from '@/lib/assets/types'
import type { SnapshotDto } from '@/lib/assets/api'
import { auditShots, type ShotAudit } from '@/lib/assets/impact'
import {
  detectVaultMode,
  loadDirectoryHandle,
  pickDirectory,
  listImages,
  listVaultFiles,
  listIgnoredKeys,
  ignoreVaultKey,
  clearIgnoredKeys,
  clearDirectoryHandle,
  clearIndexedVault,
  visibleVaultFiles,
  matchByFolderDetailed,
  summarizeAttach,
  describeMatchKind,
  looksUninformative,
  type MatchHit,
  type AttachSummary,
  type VaultFile,
  type VaultMode,
} from '@/lib/assets/vault'
import {
  buildStoryboardHtml,
  shotsToCsv,
  shotsToChainingList,
  shotsToWorkList,
  buildProjectPackageManifest,
  buildZip,
  downloadBlob,
} from '@/lib/assets/export'
import { postJson, postSse, isAbortError } from '@/lib/api'
import {
  readProjectQuery,
  readStepQuery,
  withProjectQuery,
  withStepQuery,
} from '@/lib/app-nav'
import { buildMarkdown, copyText, downloadMarkdown } from '@/lib/export'
import { fetchProjectGenerationAssets } from '@/lib/generation/client'
import {
  keyframeExportName,
  keyframeManifestEntry,
} from '@/lib/generation/export'
import {
  MIN_IDEA_LENGTH,
  GENRES,
  readGenre,
  type Genre,
  STEPS,
  type Act,
  type Character,
  type Episode,
  type StepKey,
  type StepStatus,
} from '@/lib/types'

/** 本地已挂、但尚未落库的参考图也要显示在镜头卡上（B6 的界面一致性） */
function applyLocalRefs(
  shot: Shot,
  visuals: VisualCharacter[],
  attached: Record<string, string[]>,
  placeAttached: Record<string, string[]>,
): Shot {
  const labels: string[] = []
  const missing: string[] = []

  for (const name of shot.characters) {
    const keys = attached[name] ?? []
    const hasServer = shot.refImages.some((r) => r.startsWith(`${name}·`))

    if (keys.length > 0) {
      labels.push(...keys.map((k) => `${name}·${(k.split("/").pop() ?? k).replace(/\.[^.]+$/, "")}`))
    } else if (!hasServer) {
      missing.push(name)
    }
  }

  // 场景图：按地点名挂，和角色图同一套本地优先的做法
  if (shot.place) {
    for (const k of placeAttached[shot.place] ?? []) {
      labels.push(`${shot.place}·${(k.split("/").pop() ?? k).replace(/\.[^.]+$/, "")}`)
    }
  }

  return { ...shot, refImages: Array.from(new Set([...shot.refImages, ...labels])), missingRefFor: missing }
}

/** 从本地图库取回图片二进制（仅用于打包，不上传） */
async function getVaultBlob(key: string): Promise<Blob | null> {
  const { getPreviewUrl } = await import('@/lib/assets/vault')
  const url = await getPreviewUrl(key)
  if (!url) return null
  try {
    return await fetch(url).then((r) => r.blob())
  } finally {
    URL.revokeObjectURL(url)
  }
}

const IDLE_STATUS: Record<StepKey, StepStatus> = {
  characters: 'idle',
  acts: 'idle',
  episodes: 'idle',
  visuals: 'idle',
  scenes: 'idle',
  shots: 'idle',
}

const IDLE_ERRORS: Record<StepKey, string | null> = {
  characters: null,
  acts: null,
  episodes: null,
  visuals: null,
  scenes: null,
  shots: null,
}

const STEP_ANCHORS: Record<StepKey, string> = {
  characters: 'step-characters',
  acts: 'step-acts',
  episodes: 'step-episodes',
  visuals: 'step-visuals',
  scenes: 'step-scenes',
  shots: 'step-shots',
}

const CANVAS_ARTIFACT_KIND: Record<CanvasNodeId, ArtifactKind> = {
  characters: 'characters',
  acts: 'acts',
  episodes: 'episodes',
  visuals: 'visualCharacters',
  scenes: 'scenes',
  places: 'visualPlaces',
  shots: 'shots',
}

type VariantSession =
  | { step: 'characters'; a: Character[]; b: Character[] }
  | { step: 'acts'; a: Act[]; b: Act[] }
  | { step: 'first-episode'; a: Episode[]; b: Episode[] }

export default function Home() {
  // ── 数据（全部存在内存里，没有数据库）──
  const [idea, setIdea] = useState('')
  // 题材风格：项目级参数，会被透传到全部六步的 prompt 里
  const [genre, setGenre] = useState<Genre>(GENRES[0])
  const [characters, setCharacters] = useState<Character[]>([])
  const [acts, setActs] = useState<Act[]>([])
  const [episodes, setEpisodes] = useState<Episode[]>([])

  // ── 每一步的运行状态 ──
  const [status, setStatus] = useState(IDLE_STATUS)
  const [errors, setErrors] = useState(IDLE_ERRORS)

  // 生成时把当时的「输入指纹」记下来，之后输入一变就知道这份结果已经过期了。
  // 用指纹推导而不是用 flag，避免生成完回写时把用户中途的编辑标记冲掉。
  const [actsBuiltFrom, setActsBuiltFrom] = useState<string | null>(null)
  const [episodesBuiltFrom, setEpisodesBuiltFrom] = useState<string | null>(null)

  // 正在「换一个」的角色 id / 正在补充新角色
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null)
  const [addingCharacter, setAddingCharacter] = useState(false)
  const [copied, setCopied] = useState(false)

  // ── 资产层：项目、视觉锚点、场次、镜头、本地图库 ──
  const [projectId, setProjectId] = useState<string | null>(null)
  const [visuals, setVisuals] = useState<VisualCharacter[]>([])
  const [imagePrompts, setImagePrompts] = useState<{ name: string; zh: string; en: string }[]>([])
  const [scenes, setScenes] = useState<AssetScene[]>([])
  /**
   * 地点视觉锚点。和场次同一次调用产出，但按「地点」去重——
   * 40 场戏可能只有 8-12 个地点，锚点挂在地点上，同一个房间才不会拿到几份描述。
   */
  const [places, setPlaces] = useState<VisualPlace[]>([])
  const [shots, setShots] = useState<Shot[]>([])
  const [shotProgress, setShotProgress] = useState<string | null>(null)
  /** 放映厅当前选中的那一镜：默认第一镜，点某张镜卡即切换 */
  const [activeShotId, setActiveShotId] = useState<string | null>(null)
  /**
   * 当前展示的是哪一步。六步不再堆在同一页——一页只画一步，
   * 点左栏（或窄屏步骤条）切换。生成状态都在这之外，切换不会打断正在跑的任务。
   */
  const [view, setView] = useState<StepKey>('characters')
  const projectIdRef = useRef<string | null>(null)
  useEffect(() => {
    projectIdRef.current = projectId
  }, [projectId])
  useEffect(() => {
    let cancelled = false
    const syncViewFromUrl = () => {
      setView(readStepQuery(window.location.search) ?? 'characters')
    }
    const syncFromPopState = () => {
      syncViewFromUrl()
      const targetProjectId = readProjectQuery(window.location.search)
      if (targetProjectId === projectIdRef.current) return
      if (!targetProjectId) {
        clearWorkspace()
        setProjectId(null)
        return
      }
      void (async () => {
        clearWorkspace()
        const restored = await loadProject(targetProjectId).catch(() => false)
        if (cancelled) return
        if (!restored) setProjectId(targetProjectId)
        setNotice(restored ? null : '这个项目还没有内容，可以从故事灵感开始写。')
      })()
    }
    syncViewFromUrl()
    window.addEventListener('popstate', syncFromPopState)
    return () => {
      cancelled = true
      window.removeEventListener('popstate', syncFromPopState)
    }
  }, [])
  // 影响范围：改一处之后实际受影响的下游数量（由 /api/impact 从血缘反查得出）
  const [impact, setImpact] = useState<({ affected: number } & ShotAudit) | null>(null)
  const [vaultMode, setVaultMode] = useState<VaultMode>('indexeddb')
  /** 扫到的全部图片；vaultFiles 是「按已移除名单过滤后」的可见列表 */
  const [allVaultFiles, setAllVaultFiles] = useState<VaultFile[]>([])
  /** 被用户从工作台移除的 key：目录直连模式下只影响列表，不动硬盘文件 */
  const [ignoredKeys, setIgnoredKeys] = useState<string[]>([])
  const vaultFiles = useMemo(() => visibleVaultFiles(allVaultFiles, ignoredKeys), [allVaultFiles, ignoredKeys])
  /** 正在跑的那一步的取消句柄：点「停止」时用它中断 */
  const abortRef = useRef<AbortController | null>(null)
  /** 首次默认允许检查断点；成功完成后关闭，失败/取消后重新开启。 */
  const episodeCheckpointRef = useRef(true)
  const shotCheckpointRef = useRef(true)
  /** 顶部的轻提示（已停止 / 已恢复上次项目这类「说明性」的话，不是错误） */
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])
  /** 项目列表：用于「切换 / 重命名 / 删除」 */
  const [projects, setProjects] = useState<ProjectDto[]>([])
  /** 场记是否展开：H 双舱里它就是右舱的第二个 tab */
  const [agentOpen, setAgentOpen] = useState(false)
  /** 窄屏抽屉是否展开（桌面端是常驻右舱，这个状态不参与） */
  const [deckOpen, setDeckOpen] = useState(false)
  /** 停在「产出」tab 时收到的新回答数；切到场记即清零 */
  const [agentUnread, setAgentUnread] = useState(0)
  /** 项目画布：全局节点视图，关键字段可直接修改 */
  const [canvasOpen, setCanvasOpen] = useState(false)
  /** 从画布带入场记的问题：只预填，用户确认后才发送 */
  const [agentSeed, setAgentSeed] = useState<{ id: number; text: string } | null>(null)
  /** 用户手动点过 tab 之后，不再自动切换 */
  const tabTouched = useRef(false)
  useEffect(() => {
    if (agentOpen) setAgentUnread(0)
  }, [agentOpen])
  /*
    右舱跟随当前步骤：前五步默认场记（那时"产出"只有一块空的分镜位），
    到分镜步默认产出。按步骤而不是按 shots.length，避免异步加载时闪一下。
    一旦用户自己点过 tab，就尊重他的选择。
  */
  useEffect(() => {
    if (tabTouched.current) return
    setAgentOpen(view !== 'shots')
  }, [view])
  /* 窄屏抽屉：Esc 收起 + 展开时锁住背景滚动 */
  useEffect(() => {
    if (!deckOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDeckOpen(false)
    }
    window.addEventListener('keydown', onKey)
    const mobile = window.matchMedia('(max-width: 920px)').matches
    const previous = document.body.style.overflow
    if (mobile) document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [deckOpen])
  /** 本剧集数：默认 30，记住上次选择 */
  const [episodeCount, setEpisodeCount] = useState(DEFAULT_EPISODE_COUNT)
  const episodeProjectRef = useRef<string | null>(null)
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem('chengju:episode-count'))
      if (Number.isFinite(saved) && saved > 0) setEpisodeCount(clampEpisodeCount(saved))
    } catch {
      // 隐私模式读不到就沿用默认值
    }
  }, [])
  /* 集数是项目级设置：切项目时优先读这个项目自己存过的值 */
  useEffect(() => {
    if (!projectId || episodeProjectRef.current === projectId) return
    episodeProjectRef.current = projectId
    try {
      const saved = Number(window.localStorage.getItem(`chengju:episodes:${projectId}`))
      if (Number.isFinite(saved) && saved > 0) setEpisodeCount(clampEpisodeCount(saved))
    } catch {
      // 读不到就沿用全局默认
    }
  }, [projectId])
  useEffect(() => {
    try {
      window.localStorage.setItem('chengju:episode-count', String(episodeCount))
      if (projectId && episodeProjectRef.current === projectId) {
        window.localStorage.setItem(`chengju:episodes:${projectId}`, String(episodeCount))
      }
    } catch {
      // 写不了不影响本次生成
    }
  }, [episodeCount, projectId])
  /*
    打开已有项目时，选择器要反映这个项目真实的集数，而不是上次生成时用的数字。
    流式生成期间不同步——否则一集集到达时会把用户刚选的 60 集改回 3、5、8…
  */
  useEffect(() => {
    // 少于下限时不要回写：第一集 A/B 选完后只剩 1 集，会把集数误改成 6
    if (episodes.length < MIN_EPISODE_COUNT) return
    if (status.episodes === 'streaming' || status.episodes === 'loading') return
    setEpisodeCount(clampEpisodeCount(episodes.length))
  }, [episodes.length, status.episodes])

  /** 创作意图卡 + 判断日志：都是项目级资产，P0 先存本地 */
  const [brief, setBrief] = useState<CreativeBrief>(EMPTY_BRIEF)
  const [judgments, setJudgments] = useState<JudgmentEntry[]>([])
  const [look, setLook] = useState<LookBook>(EMPTY_LOOK)
  const [metaPanel, setMetaPanel] = useState<MetaPanel | null>(null)
  const [variantSession, setVariantSession] = useState<VariantSession | null>(null)
  const [variantLoading, setVariantLoading] = useState(false)
  /** 用户选定的第一集：后续生成从第 2 集接着写 */
  const [episodeSeed, setEpisodeSeed] = useState<Episode | null>(null)
  const briefSig = useMemo(() => briefSignature(brief), [brief])
  const lookSig = useMemo(() => lookSignature(look), [look])
  const briefLoadedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!projectId || briefLoadedFor.current === projectId) return
    try {
      const briefRaw = window.localStorage.getItem(`chengju:brief:${projectId}`)
      const logRaw = window.localStorage.getItem(`chengju:judgments:${projectId}`)
      const lookRaw = window.localStorage.getItem(`chengju:look:${projectId}`)
      setBrief(readBrief(briefRaw ? JSON.parse(briefRaw) : null))
      setJudgments(readJudgments(logRaw ? JSON.parse(logRaw) : null))
      setLook(readLook(lookRaw ? JSON.parse(lookRaw) : null))
    } catch {
      setBrief(EMPTY_BRIEF)
      setJudgments([])
      setLook(EMPTY_LOOK)
    } finally {
      briefLoadedFor.current = projectId
    }
  }, [projectId])

  useEffect(() => {
    if (!projectId || briefLoadedFor.current !== projectId) return
    try {
      window.localStorage.setItem(`chengju:brief:${projectId}`, JSON.stringify(brief))
      window.localStorage.setItem(`chengju:judgments:${projectId}`, JSON.stringify(judgments))
      window.localStorage.setItem(`chengju:look:${projectId}`, JSON.stringify(look))
    } catch {
      // 隐私模式写不了，不影响本次生成
    }
  }, [projectId, brief, judgments, look])

  const recordJudgment = (step: string, action: string, reason = '') => {
    setJudgments((prev) => appendJudgment(prev, { step, action, reason }))
  }

  /** 一次出两版，让用户选——这是"判断"最直接的落点 */
  const requestVariants = async (step: 'characters' | 'acts') => {
    if (variantLoading) return
    setVariantLoading(true)
    setErrors((e) => ({ ...e, [step]: null }))
    try {
      const pid = await ensureProject(idea.trim().slice(0, 20))
      if (step === 'characters') {
        const base = { idea: idea.trim(), genre: genre.id, projectId: pid, brief }
        const [a, b] = await Promise.all([
          postJson<{ characters: Character[] }>('/api/characters', { ...base, variant: 'A' }),
          postJson<{ characters: Character[] }>('/api/characters', { ...base, variant: 'B' }),
        ])
        setVariantSession({ step, a: a.characters, b: b.characters })
      } else {
        const base = { idea: idea.trim(), genre: genre.id, characters, projectId: pid, brief }
        const [a, b] = await Promise.all([
          postJson<{ acts: Act[] }>('/api/acts', { ...base, variant: 'A' }),
          postJson<{ acts: Act[] }>('/api/acts', { ...base, variant: 'B' }),
        ])
        setVariantSession({ step, a: a.acts, b: b.acts })
      }
      setQuotaRefreshKey((n) => n + 1)
    } catch (error) {
      setErrors((e) => ({
        ...e,
        [step]: error instanceof Error ? error.message : '两版生成失败，请重试',
      }))
    } finally {
      setVariantLoading(false)
    }
  }

  const pickVariant = (id: 'A' | 'B', reason: string) => {
    const session = variantSession
    if (!session) return
    if (session.step === 'first-episode') {
      const chosen = id === 'A' ? session.a[0] : session.b[0]
      setEpisodeSeed(chosen)
      setEpisodes([chosen])
      recordJudgment('episodes', `选定第一集 ${id} 版`, reason)
      setVariantSession(null)
      return
    }
    if (session.step === 'characters') {
      setCharacters(id === 'A' ? session.a : session.b)
    } else {
      setActs(id === 'A' ? session.a : session.b)
      setActsBuiltFrom(`${charactersSig}|${briefSig}`)
    }
    recordJudgment(session.step, `选定 ${id} 版`, reason)
    setVariantSession(null)
  }

  /** 第一集开两个方向：各生成 1 集，选定后从第 2 集接着写 */
  const requestFirstEpisodes = async () => {
    if (variantLoading) return
    setVariantLoading(true)
    setErrors((e) => ({ ...e, episodes: null }))
    try {
      const pid = await ensureProject(idea.trim().slice(0, 20))
      const call = (variant: 'A' | 'B') =>
        new Promise<Episode>((resolve, reject) => {
          let last: Episode | null = null
          void postSse(
            '/api/episodes',
            {
              idea: idea.trim(),
              genre: genre.id,
              characters,
              acts,
              projectId: pid,
              count: 1,
              start: 1,
              total: episodeCount,
              preview: true,
              variant,
              brief,
            },
            (event, data) => {
              const payload = data as { episodes?: Episode[] }
              if (payload.episodes?.[0]) last = payload.episodes[0]
              if (event === 'done') {
                if (last) resolve(last)
                else reject(new Error('第一集没有生成出有效内容'))
              }
            },
          ).catch(reject)
        })
      const [a, b] = await Promise.all([call('A'), call('B')])
      setVariantSession({ step: 'first-episode', a: [a], b: [b] })
      setQuotaRefreshKey((n) => n + 1)
    } catch (error) {
      setErrors((e) => ({
        ...e,
        episodes: error instanceof Error ? error.message : '第一集两版生成失败，请重试',
      }))
    } finally {
      setVariantLoading(false)
    }
  }
  /*
    生成中用真实耗时替代「正在加载」四个字。
    这是双舱里"机器在干活"的证据，所以必须是真实的秒数，不写假数字。
  */
  const [elapsed, setElapsed] = useState(0)
  const anyRunning = Object.values(status).some((s) => s === 'loading' || s === 'streaming')
  useEffect(() => {
    if (!anyRunning) {
      setElapsed(0)
      return
    }
    const startedAt = Date.now()
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt) / 1000), 100)
    return () => window.clearInterval(timer)
  }, [anyRunning])
  /** 给助手的额度快照：它要能回答「还能用几次」 */
  const [agentQuota, setAgentQuota] = useState<{ remaining: number; limit: number; projectsLeft: number } | null>(null)
  /** 上一次扫描的挂接明细：角色名 -> 命中记录（带置信度），界面据此标注「靠什么认出来的」 */
  const [matchDetail, setMatchDetail] = useState<Record<string, MatchHit[]>>({})
  /** 扫描汇总：挂了几张、谁没命中。静默失败是之前最大的问题 */
  const [attachSummary, setAttachSummary] = useState<AttachSummary | null>(null)
  /** AI 认图进行中 */
  const [matching, setMatching] = useState(false)
  /** AI 认图的候选建议，等用户逐条确认 */
  const [aiSuggestions, setAiSuggestions] = useState<
    { character: string; key: string; confidence: 'high' | 'low'; reason: string }[]
  >([])
  const [aiNote, setAiNote] = useState<string | null>(null)
  const [attached, setAttached] = useState<Record<string, string[]>>({})
  /** 地点名 -> 该地点的场景图 key。和角色图分开存：它们的归属类型不同，混在一起迟早串 */
  const [placeAttached, setPlaceAttached] = useState<Record<string, string[]>>({})
  // 记录「这份结果基于哪一版上游」，用于过期判定（服务端血缘 + 前端快速判断）
  const [visualsBuiltFrom, setVisualsBuiltFrom] = useState<string | null>(null)
  const [shotsBuiltFrom, setShotsBuiltFrom] = useState<string | null>(null)

  // 额度刷新信号：任何一步生成成功后 +1，让 IdeaPanel 里的额度条重新查询。
  // 用递增数字而不是布尔，是因为「连续生成两次」也要各自触发一次查询。
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0)

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 「清空重来」时 +1。请求返回时若纪元变了，说明结果已经不该要了，直接丢弃
  const resetEpoch = useRef(0)

  // 输入指纹
  const charactersSig = useMemo(() => JSON.stringify(characters), [characters])
  const actsSig = useMemo(() => JSON.stringify(acts), [acts])

  const hasCharacters = characters.length > 0
  const hasActs = acts.length > 0
  const hasEpisodes = episodes.length > 0
  const hasResult = hasCharacters || hasActs || hasEpisodes || visuals.length > 0 || shots.length > 0

  // 步骤条高亮到「第一个还没产出内容的步骤」；六步全部有内容时停在最后一步
  const currentStep = !hasCharacters ? 1 : !hasActs ? 2 : !hasEpisodes ? 3 : !visuals.length ? 4 : !scenes.length ? 5 : 6

  /** 六步的完成态：窄屏步骤条与桌面左栏共用一份，避免两处各写一遍 */
  const stepCompleted: Record<StepKey, boolean> = {
    characters: hasCharacters,
    acts: hasActs,
    episodes: hasEpisodes,
    visuals: visuals.length > 0,
    scenes: scenes.length > 0,
    shots: shots.length > 0,
  }
  const completedCount = Object.values(stepCompleted).filter(Boolean).length
  const projectStatus = useMemo(() => buildProjectStatus({
    characters,
    acts,
    episodes,
    visuals,
    scenes,
    places,
    shots,
    expiredShots: impact?.expired ?? 0,
    visualsStale: visualsBuiltFrom !== charactersSig,
  }), [characters, acts, episodes, visuals, scenes, places, shots, impact?.expired, visualsBuiltFrom, charactersSig])
  const canvasCounts = projectStatus.counts
  const canvasIssues = projectStatus.issues
  const missingPlaces = projectStatus.placeGaps
  const canvasPreviews = useMemo<Partial<Record<CanvasNodeId, CanvasPreview>>>(() => ({
    characters: {
      summary: '动机与人物弧光决定角色能不能驱动下游冲突。',
      items: characters.map((c) => ({
        id: c.id,
        title: c.name || '未命名角色',
        meta: c.identity || '身份待补',
        note: `动机：${c.motivation || '待补'} · 弧光：${c.arc || '待补'}`,
        missing: !c.motivation.trim() || !c.arc.trim(),
        edit: { field: 'motivation', label: '核心动机', value: c.motivation, maxLength: 160, rows: 3 },
      })),
    },
    acts: {
      summary: '三幕结构决定整部剧的起承转合，情节点越清楚，分集越稳。',
      items: acts.map((a, index) => ({
        id: a.id,
        title: a.title || `第 ${index + 1} 幕`,
        meta: `${a.beats.length} 个情节点`,
        note: a.summary || '这一幕的概要待补',
        missing: !a.summary.trim() || a.beats.length === 0,
        edit: { field: 'summary', label: '这一幕概要', value: a.summary, maxLength: 400, rows: 4 },
      })),
    },
    episodes: {
      summary: '每集结尾钩子决定追看，短于 20 字时节点会提示继续补强。',
      items: episodes.map((e) => ({
        id: e.id,
        title: `第 ${e.number} 集 · ${e.title || '未命名'}`,
        meta: e.hook ? `钩子 ${e.hook.trim().length} 字` : '还没有钩子',
        note: e.hook || e.synopsis || '这一集的内容待补',
        missing: !e.hook.trim() || e.hook.trim().length < 20,
        edit: { field: 'hook', label: '结尾钩子', value: e.hook, maxLength: 160, rows: 3 },
      })),
    },
    visuals: {
      summary: '定妆锚点会被逐字复用到镜头提示词，决定角色跨镜一致性。',
      items: visuals.map((v) => ({
        id: v.id,
        title: v.name || '未命名角色',
        meta: v.age || '年龄待补',
        note: visualsBuiltFrom !== charactersSig
          ? `人物设定已更新，当前锚点需要复核。${v.anchor || '视觉锚点待补'}`
          : v.anchor || '视觉锚点待补',
        missing: visualsBuiltFrom !== charactersSig || !v.anchor.trim(),
        edit: { field: 'anchor', label: '视觉锚点', value: v.anchor, maxLength: 1200, rows: 4 },
      })),
    },
    scenes: {
      summary: '场次是分镜的输入单位，地点、时间与人物都要能被下游直接使用。',
      items: scenes.map((s) => ({
        id: s.id,
        title: `第 ${s.number} 场 · ${s.location || '地点待补'}`,
        meta: `${s.timeOfDay || '时间待补'} · ${s.characters.join('、') || '没有标注角色'}`,
        note: s.summary || '这场戏的概要待补',
        missing: !s.location.trim() || !s.summary.trim(),
        edit: { field: 'summary', label: '场景概要', value: s.summary, maxLength: 400, rows: 4 },
      })),
    },
    shots: {
      summary: '分镜是本轮交付物，缺参考图的镜头会在节点上显式提醒。',
      items: shots.map((s) => ({
        id: s.id,
        title: `第 ${s.shot} 镜 · ${s.scene || '场景待补'}`,
        meta: `第 ${s.episode || '?'} 集 · ${s.shotSize} · ${s.camera}`,
        note: s.missingRefFor.length
          ? `缺 ${s.missingRefFor.join('、')} 的参考图`
          : s.status === 'rework'
            ? '已标记需返修'
            : s.action || s.dialogue || '画面动作与台词待补',
        missing: s.missingRefFor.length > 0 || s.status === 'rework',
        edit: { field: 'action', label: '画面动作', value: s.action, maxLength: 400, rows: 3 },
      })),
    },
    places: {
      summary: '地点锚点解决同一空间跨镜漂移，一处地点只保留一份描述。',
      items: places.map((p) => ({
        id: p.id,
        title: p.name || '未命名地点',
        meta: p.lighting || '光线条件待补',
        note: p.anchor || '地点锚点待补',
        missing: !p.anchor.trim(),
        edit: { field: 'anchor', label: '地点锚点', value: p.anchor, maxLength: 1200, rows: 4 },
      })),
    },
  }), [characters, acts, episodes, visuals, visualsBuiltFrom, charactersSig, scenes, shots, places])

  async function handleCanvasEdit(
    node: CanvasNodeId,
    itemId: string,
    field: string,
    value: string,
    mode: 'edit' | 'undo',
  ) {
    let nextPayload: unknown = null
    let commit = () => {}

    if (node === 'characters' && field === 'motivation') {
      const item = characters.find((entry) => entry.id === itemId)
      if (!item || item.motivation === value) return
      const next = characters.map((entry) => (entry.id === itemId ? { ...entry, motivation: value } : entry))
      nextPayload = next
      commit = () => setCharacters(next)
    } else if (node === 'acts' && field === 'summary') {
      const item = acts.find((entry) => entry.id === itemId)
      if (!item || item.summary === value) return
      const next = acts.map((entry) => (entry.id === itemId ? { ...entry, summary: value } : entry))
      nextPayload = next
      commit = () => setActs(next)
    } else if (node === 'episodes' && field === 'hook') {
      const item = episodes.find((entry) => entry.id === itemId)
      if (!item || item.hook === value) return
      const next = episodes.map((entry) => (entry.id === itemId ? { ...entry, hook: value } : entry))
      nextPayload = next
      commit = () => setEpisodes(next)
    } else if (node === 'visuals' && field === 'anchor') {
      const item = visuals.find((entry) => entry.id === itemId)
      if (!item || item.anchor === value) return
      const next = visuals.map((entry) => (entry.id === itemId ? { ...entry, anchor: value } : entry))
      nextPayload = next
      commit = () => {
        setVisuals(next)
        setVisualsBuiltFrom(charactersSig)
      }
    } else if (node === 'scenes' && field === 'summary') {
      const item = scenes.find((entry) => entry.id === itemId)
      if (!item || item.summary === value) return
      const next = scenes.map((entry) => (entry.id === itemId ? { ...entry, summary: value } : entry))
      nextPayload = next
      commit = () => setScenes(next)
    } else if (node === 'shots' && field === 'action') {
      const item = shots.find((entry) => entry.id === itemId)
      if (!item || item.action === value) return
      const next = shots.map((entry) => (entry.id === itemId ? { ...entry, action: value } : entry))
      nextPayload = next
      commit = () => setShots(next)
    } else if (node === 'places' && field === 'anchor') {
      const item = places.find((entry) => entry.id === itemId)
      if (!item || item.anchor === value) return
      const next = places.map((entry) => (entry.id === itemId ? { ...entry, anchor: value } : entry))
      nextPayload = next
      commit = () => setPlaces(next)
    }

    if (!nextPayload) return
    const pid = projectId ?? await ensureProject(idea.trim().slice(0, 20))
    if (!pid) throw new Error('项目尚未创建，暂时无法保存到项目版本')
    await saveSnapshot(pid, CANVAS_ARTIFACT_KIND[node], nextPayload)
    commit()
    if (node === 'visuals') void refreshImpact(pid)
    const nodeLabel = node === 'places' ? '地点锚点' : STEPS.find((step) => step.key === node)?.nav ?? node
    const fieldLabel = field === 'motivation'
      ? '核心动机'
      : field === 'hook'
        ? '结尾钩子'
        : field === 'action'
          ? '画面动作'
          : field === 'summary'
            ? node === 'acts' ? '幕概要' : '场景概要'
            : node === 'places' ? '地点锚点' : '角色锚点'
    recordJudgment(node, mode === 'undo' ? '画布内撤销' : '画布内修改', `${nodeLabel} · ${fieldLabel}`)
  }

  async function loadCanvasVersions(node: CanvasNodeId) {
    if (!projectId) return []
    return listSnapshots<unknown>(projectId, CANVAS_ARTIFACT_KIND[node])
  }

  async function restoreCanvasVersion(node: CanvasNodeId, payload: unknown) {
    if (!Array.isArray(payload)) throw new Error('这个版本的内容无法恢复')
    const pid = projectId ?? await ensureProject(idea.trim().slice(0, 20))
    if (!pid) throw new Error('项目尚未创建，暂时无法恢复版本')

    await saveSnapshot(pid, CANVAS_ARTIFACT_KIND[node], payload)

    if (node === 'characters') setCharacters(payload as Character[])
    else if (node === 'acts') setActs(payload as Act[])
    else if (node === 'episodes') setEpisodes(payload as Episode[])
    else if (node === 'visuals') {
      setVisuals(payload as VisualCharacter[])
      setVisualsBuiltFrom(charactersSig)
    } else if (node === 'scenes') setScenes(payload as AssetScene[])
    else if (node === 'places') setPlaces(payload as VisualPlace[])
    else if (node === 'shots') setShots(payload as Shot[])

    if (node === 'visuals') void refreshImpact(pid)
    const nodeLabel = node === 'places' ? '地点锚点' : STEPS.find((step) => step.key === node)?.nav ?? node
    recordJudgment(node, '画布内恢复版本', nodeLabel)
  }

  const firstRun = !hasResult && idea.trim().length === 0
  const shotMissingRefs = useMemo(
    () => Array.from(new Set(shots.flatMap((shot) => shot.missingRefFor))).filter(Boolean),
    [shots],
  )

  const todoItems = buildTodoList({
    completed: stepCompleted,
    shots,
    expiredShots: impact?.expired ?? 0,
    hasIdea: idea.trim().length > 0,
  })

  /**
   * 六步之间可以自由切换：没生成的那一步会自己说明「请先做上一步」，
   * 比把入口锁死更好——用户看得见后面有什么，才知道值不值得往下走。
   */
  const canJump = () => true

  /** 点左栏/窄屏步骤条：切到那一步，并把页面滚回顶部 */
  const goToStep = (key: StepKey) => {
    if (key !== view) {
      const search = withStepQuery(window.location.search, key)
      window.history.pushState({ step: key }, '', `${window.location.pathname}${search}${window.location.hash}`)
    }
    setView(key)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** 项目是 URL 的一等状态：切换写历史，自动恢复和新建则只修正当前记录。 */
  function writeProjectToUrl(projectIdValue: string | null, mode: 'push' | 'replace' = 'replace') {
    const rawCurrent = new URLSearchParams(window.location.search).get('project')
    if ((projectIdValue ?? null) === rawCurrent) return
    const search = withProjectQuery(window.location.search, projectIdValue)
    const href = `${window.location.pathname}${search}${window.location.hash}`
    const previous = window.history.state && typeof window.history.state === 'object'
      ? window.history.state
      : {}
    const state = { ...previous, project: projectIdValue }
    if (mode === 'push') window.history.pushState(state, '', href)
    else window.history.replaceState(state, '', href)
  }

  /** 左栏高亮的是「正在看的那一步」，不是「该做哪一步」 */
  const viewIndex = STEPS.find((s) => s.key === view)?.index ?? currentStep

  /**
   * 一步做完之后给一句下一步提示：主线的下一站 + 顺手能去的资产步骤。
   * 为什么要它：现在一次只显示一步，用户看不到后面还有什么，
   * 生成完如果没人告诉他，他只能自己去猜要不要点左边那一栏。
   */
  const NEXT_STEP: Partial<Record<StepKey, StepKey>> = {
    characters: 'acts',
    acts: 'episodes',
    episodes: 'scenes',
    scenes: 'shots',
  }
  /** 角色一生成完，定妆就解锁了——它不是主线下一站，但用户此刻最该知道 */
  const SIDE_STEP: Partial<Record<StepKey, { key: StepKey; note: string }>> = {
    characters: { key: 'visuals', note: '角色已经就位，可以顺手去「定妆」给他们挂参考图' },
  }
  const stepOf = (key: StepKey) => STEPS.find((s) => s.key === key)
  const nextStep = NEXT_STEP[view]
  const sideStep = SIDE_STEP[view]
  const nextNav = nextStep ? stepOf(nextStep)?.nav : undefined
  const nextProps =
    nextStep && nextNav
      ? { nextLabel: `下一步：${nextNav}`, onNext: () => goToStep(nextStep) }
      : {}

  /** 放映厅盯着的那一镜：用户点过就用点过的，否则默认第一镜 */
  const activeShot = useMemo(
    () => shots.find((s) => s.id === activeShotId) ?? shots[0] ?? null,
    [shots, activeShotId],
  )

  /** 把 AI 助手改写好的文本写回当前镜头——只改被问到的那一镜，不碰其它字段 */
  const applyAssistantText = (target: 'prompt' | 'action', text: string) => {
    if (!activeShot) return
    setShots((prev) => prev.map((s) => (s.id === activeShot.id ? { ...s, [target]: text } : s)))
  }

  // 上游改过之后，下游结果就是基于旧版本生成的
  const actsStale = hasActs && actsBuiltFrom !== `${charactersSig}|${briefSig}`
  const episodesStale = hasEpisodes && episodesBuiltFrom !== `${charactersSig}|${actsSig}|${briefSig}`

  const isCleared = (epoch: number) => resetEpoch.current !== epoch

  // ── 通用：跑一个步骤，统一处理 loading / error / 被清空 ──
  /*
    不能只看 status —— 恢复历史项目时内容已经在，但 status 仍是 idle。
    判断日志要按"有没有内容"来决定这是首次生成还是重新生成。
  */
  const stepHasContent = (step: StepKey): boolean => {
    if (step === 'characters') return characters.length > 0
    if (step === 'acts') return acts.length > 0
    if (step === 'episodes') return episodes.length > 0
    if (step === 'visuals') return visuals.length > 0
    if (step === 'scenes') return scenes.length > 0
    return shots.length > 0
  }

  async function runStep<T>(step: StepKey, task: () => Promise<T>, onSuccess: (data: T) => void) {
    // 已经有结果时再点，就是一次"重新生成"——自动留一条判断记录
    if (stepHasContent(step)) recordJudgment(step, '重新生成')
    const epoch = resetEpoch.current
    // 每个长任务一个 controller：用户点「停止」时中断这一跑，不动别的
    const controller = new AbortController()
    abortRef.current = controller
    setStatus((s) => ({ ...s, [step]: 'loading' }))
    setErrors((e) => ({ ...e, [step]: null }))
    try {
      const data = await task()
      if (isCleared(epoch)) return // 生成期间点了「清空重来」，不要把结果塞回去
      onSuccess(data)
      // 额度已消耗，通知界面上那一条刷新。放在这里而不是每个步骤里各写一次，
      // 是因为 runStep 是六步中四步的统一出口，少写一处就少一处漏刷
      setQuotaRefreshKey((n) => n + 1)
      setStatus((s) => ({ ...s, [step]: 'done' }))
    } catch (error) {
      if (isCleared(epoch)) return
      // 用户主动停止不是故障：安静收场，不要弹一条红色错误
      if (isAbortError(error)) {
        setStatus((s) => ({ ...s, [step]: 'idle' }))
        setNotice('已停止这一步。已生成的内容不受影响。')
        return
      }
      const message = error instanceof Error ? error.message : '生成失败，请重试'
      setErrors((e) => ({ ...e, [step]: message }))
      setStatus((s) => ({ ...s, [step]: 'error' }))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  /** 停止当前正在跑的这一步 */
  function cancelRun() {
    abortRef.current?.abort()
  }

  // ── 第一步：生成人物 ──
  const generateCharacters = () =>
    runStep(
      'characters',
      async () => {
        // 现在第一步也要建项目：想法与人物都会被落成快照，刷新后才能恢复
        const pid = await ensureProject(idea.trim().slice(0, 20))
        return postJson<{ characters: Character[] }>(
          '/api/characters',
          { idea: idea.trim(), genre: genre.id, projectId: pid, brief },
          abortRef.current?.signal,
        )
      },
      ({ characters: list }) => setCharacters(list),
    )

  /** 只换掉某一个角色 */
  const regenerateCharacter = async (id: string) => {
    recordJudgment('characters', '换一个角色')
    const epoch = resetEpoch.current
    setRegeneratingId(id)
    setErrors((e) => ({ ...e, characters: null }))
    try {
      const data = await postJson<{ characters: Character[] }>('/api/characters', {
        idea: idea.trim(),
        genre: genre.id,
        mode: 'single',
        existing: characters.filter((c) => c.id !== id),
        brief,
      })
      if (isCleared(epoch)) return
      const fresh = data.characters[0]
      if (!fresh) throw new Error('AI 没有生成出新的角色，请重试')
      // 复用原来的 id，避免 React 重建整张卡片、丢掉正在编辑的焦点
      setCharacters((list) => list.map((c) => (c.id === id ? { ...fresh, id } : c)))
    } catch (error) {
      if (isCleared(epoch)) return
      setErrors((e) => ({ ...e, characters: error instanceof Error ? error.message : '生成失败' }))
    } finally {
      setRegeneratingId(null)
    }
  }

  /** 往现有阵容里再加一个角色（上限 5 个） */
  const addCharacter = async () => {
    const epoch = resetEpoch.current
    setAddingCharacter(true)
    setErrors((e) => ({ ...e, characters: null }))
    try {
      const data = await postJson<{ characters: Character[] }>('/api/characters', {
        idea: idea.trim(),
        genre: genre.id,
        mode: 'single',
        existing: characters,
        brief,
      })
      if (isCleared(epoch)) return
      const fresh = data.characters[0]
      if (!fresh) throw new Error('AI 没有生成出新的角色，请重试')
      setCharacters((list) => [...list, fresh])
    } catch (error) {
      if (isCleared(epoch)) return
      setErrors((e) => ({ ...e, characters: error instanceof Error ? error.message : '生成失败' }))
    } finally {
      setAddingCharacter(false)
    }
  }

  // ── 第二步：生成三幕大纲 ──
  const generateActs = () =>
    runStep(
      'acts',
      async () => {
        const pid = await ensureProject(idea.trim().slice(0, 20))
        return postJson<{ acts: Act[] }>(
          '/api/acts',
          { idea: idea.trim(), genre: genre.id, characters, projectId: pid, brief },
          abortRef.current?.signal,
        )
      },
      ({ acts: list }) => {
        setActs(list)
        setActsBuiltFrom(`${charactersSig}|${briefSig}`) // 记下这批大纲基于哪版人物与哪版意图
      },
    )

  // ── 第三步：生成分集（流式，一集一集出现）──
  // 这里不复用 runStep：它的 task 只在全部完成时返回一次结果，
  // 而流式需要在接收过程中就反复更新界面。
  const generateEpisodes = async () => {
    if (episodes.length > 0) recordJudgment('episodes', '重新生成分集')
    const epoch = resetEpoch.current
    const builtFrom = `${charactersSig}|${actsSig}|${briefSig}`
    const seed = episodeSeed
    const startAt = seed ? 2 : 1
    const runCount = seed ? Math.max(1, episodeCount - 1) : episodeCount

    setStatus((s) => ({ ...s, episodes: 'streaming' }))
    setErrors((e) => ({ ...e, episodes: null }))
    // 先清空，重新生成时才看得出是一集集新出现的；有选定第一集时它保持不动
    setEpisodes(seed ? [seed] : [])

    let finished = false
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const pid = await ensureProject(idea.trim().slice(0, 20))
      await postSse('/api/episodes', { idea: idea.trim(), genre: genre.id, characters, acts, projectId: pid, count: runCount, start: startAt, total: episodeCount, brief, resume: episodeCheckpointRef.current }, (event, data) => {
        if (isCleared(epoch)) return
        if (event !== 'episodes' && event !== 'done' && event !== 'resume') return

        const incoming = (data as { episodes: Episode[] }).episodes
        setEpisodes(seed ? [seed, ...incoming] : incoming)
        // 拿到的这一份就是基于当前上游生成的，标记一下，免得触发「已过期」提示
        setEpisodesBuiltFrom(builtFrom)

        if (event === 'done') {
          finished = true
          episodeCheckpointRef.current = false
          setQuotaRefreshKey((n) => n + 1)
          setStatus((s) => ({ ...s, episodes: 'done' }))
        }
      }, controller.signal)

      // 连接断了却没收到 done：不能把界面永远停在「生成中…」
      if (!finished) throw new Error('生成中断，请重试')
    } catch (error) {
      if (isCleared(epoch)) return
      if (isAbortError(error)) {
        episodeCheckpointRef.current = true
        // 停止流式生成的收场：保留已经到达的那几集，不要清空
        setStatus((s) => ({ ...s, episodes: 'idle' }))
        setNotice('已停止生成分集。已经出来的几集保留在工作台上。')
        return
      }
      const message = error instanceof Error ? error.message : '生成失败，请重试'
      episodeCheckpointRef.current = true
      setErrors((e) => ({ ...e, episodes: message }))
      setStatus((s) => ({ ...s, episodes: 'error' }))
      setNotice('已完成批次已保留；再点一次会从断点继续。')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }

  /**
   * 用于匹配的角色名列表。
   *
   * 优先用核心人物（第一步就有的），而不是等视觉定妆。
   * 为什么：图往往在第一步之后就陆续下载到文件夹里了，如果非要等定妆才认图，
   * 用户会看到「图库里有 5 张图，但界面什么都不说」——这正是我们要消灭的静默状态。
   * 定妆里的角色名是核心人物的子集，用核心人物当名单更全。
   */
  const characterNames = useMemo(() => {
    const fromCharacters = characters.map((c) => c.name.trim()).filter(Boolean)
    if (fromCharacters.length > 0) return fromCharacters
    return visuals.map((v) => v.name).filter(Boolean)
  }, [characters, visuals])

  /**
   * 角色名 -> 命中方式的中文说明（「拼音」「中文名」…），显示在角色卡角标上。
   * 只标「不是中文直接命中」的——中文命中是预期行为，不需要解释。
   */
  const matchNotes = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [name, hits] of Object.entries(matchDetail)) {
      const best = hits[0]
      if (best && best.kind !== 'zh') out[name] = describeMatchKind(best.kind)
    }
    return out
  }, [matchDetail])

  // ── 导出 ──
  const markdown = () => buildMarkdown({ idea: idea.trim(), characters, acts, episodes })

  // ── 资产层：项目与本地图库 ──────────────────────────────────

  /** 惰性建项目：第一次需要落库时才创建，避免空项目堆积 */
  async function ensureProject(title: string): Promise<string | null> {
    if (projectId) return projectId
    try {
      const { project } = await createProject(title || "未命名漫剧")
      setProjectId(project.id)
      writeProjectToUrl(project.id, 'replace')
      // 新项目要立刻出现在项目条里，否则用户看不到「刚才那次生成存到哪了」
      void refreshProjects()
      return project.id
    } catch {
      // 建项目失败不阻断生成：退化为匿名使用（F3 降级不阻断）
      return null
    }
  }

  /** 挂一张本地图到角色上：只登记引用与指纹，图不上传（P1） */
  async function attachImage(characterName: string, file: VaultFile) {
    setAttached((prev) => ({
      ...prev,
      [characterName]: [...(prev[characterName] ?? []).filter((k) => k !== file.key), file.key],
    }))

    if (!projectId) return
    try {
      await registerRefs(projectId, [{
        vaultKey: file.key,
        label: file.name.replace(/\.[^.]+$/, "").slice(0, 20),
        fileHash: file.hash,
        mime: file.mime,
        bytes: file.size,
        ownerType: "character",
        ownerId: characterName,
      }])
    } catch {
      // 台账登记失败不影响本地已挂的图
    }
  }

  /**
   * 查影响范围：定妆（visualCharacters）改动后，血缘上哪些下游被牵连。
   *
   * 这是「改一处、算得出影响了谁」在界面上的落点。它在生成成功后各触发一次，
   * 不在每次输入时查——每次输入都查要打三个接口，而且结论要等快照落库之后才成立。
   *
   * 为什么允许显式传 projectId：刚生成完的那一刻，`projectId` 这个 state 还是
   * 上一次渲染的值（null）——ensureProject 刚 setProjectId，紧接着的 onSuccess
   * 闭包读到的仍是旧值，于是这里会一声不响地 return，面板永远不出现。
   * 调用方手里本来就有刚建好的 id，直接传进来最可靠。
   */
  async function refreshImpact(pidOverride?: string) {
    const pid = pidOverride ?? projectId
    if (!pid) return
    try {
      const [vcSnaps, shotsSnaps] = await Promise.all([
        listSnapshots<unknown>(pid, "visualCharacters"),
        listSnapshots<unknown>(pid, "shots"),
      ])
      const latestVc = vcSnaps[0]

      // 两件事分开算，因为它们回答的不是同一个问题：
      //   affected —— 「谁依赖当前这版定妆」（血缘正查）
      //   expired  —— 「当前这版分镜里有多少镜的提示词跟不上定妆了」（分镜侧对账）
      // 后者不能从新定妆查下游：旧分镜依赖的是旧定妆，那条路查不到它们。
      const affected = latestVc ? (await findImpact(latestVc.id)).length : 0
      const audit = auditShots(vcSnaps, shotsSnaps)

      setImpact({ affected, ...audit })
    } catch {
      // 影响范围是增强信息，查不到不影响主流程
    }
  }

  /** 摘掉一张已挂的图：挂错了要能撤回（只改本地，台账保留历史） */
  function detachImage(characterName: string, key: string) {
    setAttached((prev) => {
      const rest = (prev[characterName] ?? []).filter((k) => k !== key)
      return { ...prev, [characterName]: rest }
    })
  }

  /** 给地点挂一张场景图。和角色图走同一条路：只登记引用与指纹，图不上传（P1） */
  async function attachPlaceImage(placeName: string, file: VaultFile) {
    setPlaceAttached((prev) => ({
      ...prev,
      [placeName]: [...(prev[placeName] ?? []).filter((k) => k !== file.key), file.key],
    }))

    if (!projectId) return
    try {
      await registerRefs(projectId, [{
        vaultKey: file.key,
        label: file.name.replace(/\.[^.]+$/, "").slice(0, 20),
        fileHash: file.hash,
        mime: file.mime,
        bytes: file.size,
        ownerType: "place",
        ownerId: placeName,
      }])
    } catch {
      // 台账登记失败不影响本地已挂的图
    }
  }

  function detachPlaceImage(placeName: string, key: string) {
    setPlaceAttached((prev) => {
      const rest = (prev[placeName] ?? []).filter((k) => k !== key)
      return { ...prev, [placeName]: rest }
    })
  }

  /**
   * 自动预挂：目录结构、文件名、拼音三路线索一起用。
   *
   * 只补空缺，不覆盖用户已经手动挂好的。同时留下命中明细与汇总，
   * 让界面能把「挂了几张、靠什么认出来的、谁没挂上」讲清楚——
   * 之前是静默失败：用户以为挂好了，其实一张都没挂。
   */
  function autoAttachByFolder(files: VaultFile[]) {
    const names = characterNames
    if (names.length === 0 || files.length === 0) {
      setMatchDetail({})
      setAttachSummary(null)
      return
    }

    const detailed = matchByFolderDetailed(files, names)
    setMatchDetail(detailed)
    setAttachSummary(summarizeAttach(files, names, detailed))

    if (Object.keys(detailed).length === 0) return
    setAttached((prev) => {
      const next: Record<string, string[]> = { ...prev }
      for (const [name, hits] of Object.entries(detailed)) {
        const bucket = [...(next[name] ?? [])]
        for (const hit of hits) if (!bucket.includes(hit.key)) bucket.push(hit.key)
        next[name] = bucket
      }
      return next
    })
  }

  /**
   * AI 认图兜底：算法认不出来的交给模型，但只送「文件名字符串」。
   *
   * 触发条件把握在用户手里：不自动调用。理由有两个——
   *   1. 自动调用要在每次扫描时打一次模型，慢且费额度
   *   2. 认错角色比不认更糟，必须让用户知道自己正在「让 AI 猜」
   */
  async function askAiToMatch() {
    const names = characterNames
    if (names.length === 0 || vaultFiles.length === 0) return

    // 只送还没挂上的图；已经靠确定性规则挂好的不必再猜
    const pending = vaultFiles.filter((file) =>
      !Object.values(attached).some((keys) => keys.includes(file.key)),
    )
    if (pending.length === 0) { setAiNote('所有图都已经挂上了，不需要 AI 帮忙'); return }

    setMatching(true)
    setAiNote(null)
    try {
      const data = await postJson<{
        matches: { character: string; key: string; confidence: 'high' | 'low'; reason: string }[]
      }>('/api/asset-match', {
        characters: names,
        // ★ 只送文件名与路径字符串，绝不送图片内容
        files: pending.map((f) => ({ key: f.key, name: f.name })),
      })

      setAiSuggestions(data.matches ?? [])
      if ((data.matches ?? []).length === 0) {
        setAiNote(`AI 看了 ${pending.length} 张图的名字，也没认出来（这些名字里确实没有角色线索）`)
      } else {
        setAiNote(`AI 认出了 ${data.matches.length} 张，请逐条确认`)
      }
    } catch (e) {
      setAiNote(e instanceof Error ? e.message : 'AI 识别失败，请重试')
    } finally {
      setMatching(false)
    }
  }

  /** 采纳一条 AI 建议 */
  function acceptSuggestion(sug: { character: string; key: string }) {
    const file = vaultFiles.find((f) => f.key === sug.key)
    if (file) void attachImage(sug.character, file)
    setAiSuggestions((prev) => prev.filter((s) => s.key !== sug.key))
  }
  /** 选择素材目录（Chrome/Edge）并扫描 */
  async function handlePickDirectory() {
    const handle = await pickDirectory().catch(() => null)
    if (!handle) return
    const files = await listImages(handle).catch(() => [])
    setAllVaultFiles(files)
    autoAttachByFolder(files)
  }

  async function handleReloadVault() {
    const handle = await loadDirectoryHandle()
    if (!handle) return
    const files = await listImages(handle).catch(() => [])
    setAllVaultFiles(files)
    autoAttachByFolder(files)
  }

  /**
   * 从工作台移除一张图。
   *
   * 目录直连模式下**不碰用户硬盘**：只把它加进「不再显示」名单，
   * 「图留在你自己机器上」是产品承诺，一个按钮删掉别人的素材是事故。
   * IndexedDB 模式下这张图本来就是应用存的，同样是移除名单（数据还在浏览器里，
   * 想彻底清掉用面板底部的「清空本地图库」）。
   */
  async function handleIgnoreVaultFile(key: string) {
    await ignoreVaultKey(key).catch(() => {})
    setIgnoredKeys((prev) => (prev.includes(key) ? prev : [...prev, key]))
  }

  /** 误删的退路：一次性恢复所有被移除的图 */
  async function handleRestoreVaultFiles() {
    await clearIgnoredKeys().catch(() => {})
    setIgnoredKeys([])
  }

  /** 面板底部的出口：目录直连=断开文件夹（不动文件）；IndexedDB=真删 */
  async function handleClearVault() {
    if (vaultMode === 'fs-access') {
      await clearDirectoryHandle().catch(() => {})
    } else {
      await clearIndexedVault().catch(() => {})
    }
    setAllVaultFiles([])
    setIgnoredKeys([])
  }

  /**
   * 角色名变化后重新匹配一次。
   *
   * 场景：用户先扫了文件夹（那时还没有角色，一张都挂不上），
   * 然后生成了核心人物。这时如果不重跑匹配，用户会以为「扫过了就是没对上」。
   * 只依赖 characterNames（稳定的字符串数组），避免每次 render 都触发。
   */
  const namesKey = characterNames.join("\u0001")
  useEffect(() => {
    if (vaultFiles.length === 0) return
    autoAttachByFolder(vaultFiles)
    // autoAttachByFolder 是稳定纯函数逻辑，这里只需在「角色名单或图片列表变了」时重跑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey, vaultFiles])

  // 图库能力探测：只在客户端执行
  useEffect(() => {
    setVaultMode(detectVaultMode())
    listVaultFiles().then(setAllVaultFiles).catch(() => {})
    listIgnoredKeys().then(setIgnoredKeys).catch(() => {})
    loadDirectoryHandle()
      .then(async (h) => { if (h) setAllVaultFiles(await listImages(h).catch(() => [])) })
      .catch(() => {})
  }, [])

  // 额度快照：场记要用它回答「还能用几次」，每次生成后跟着刷新
  useEffect(() => {
    fetchQuota()
      .then((q) => setAgentQuota({ remaining: q.remaining, limit: q.limit, projectsLeft: q.projectsLeft }))
      .catch(() => {})
  }, [quotaRefreshKey])

  /**
   * 恢复上次的项目。
   *
   * 起因：所有内容原本只活在内存里，刷新一下六步全丢——这是最像 Demo 的地方。
   * 服务端 SQLite 里其实一直存着每一步的快照（定妆/场景/分镜早就在写，
   * 这一轮把想法/人物/三幕/分集也补上了），这里按「最近更新的项目」把整条链路填回来。
   *
   * 只恢复内容不为空的项目：用户可能只是点过「生成」但失败了，
   * 那种空壳项目不该在每次打开时弹一句「已恢复」。
   */
  /**
   * 把一个项目的快照全部读回工作台。挂载恢复与手动切换共用这一段，
   * 免得「切项目」和「刷新恢复」两套逻辑各写一遍、迟早分叉。
   * @returns 是否真的有内容被恢复（空项目返回 false）
   */
  async function loadProject(pid: string): Promise<boolean> {
    /*
      按 ARTIFACT_KINDS 逐类取：这样新增一个快照类型时，这里**自动**跟着取，
      不会出现「接口白名单加了、恢复逻辑漏了」或反过来的漂移——
      真发生过一次：visualPlaces 漏在白名单外，Promise.all 整体 400，
      恢复静默失效，用户每次打开都是空工作台。
    */
    const [pairs, refs] = await Promise.all([
      Promise.all(
        ARTIFACT_KINDS.map(async (kind) => [kind, await listSnapshots<unknown>(pid, kind)] as const),
      ),
      listRefs(pid).catch(() => []),
    ])
    const byKind = Object.fromEntries(pairs) as Record<ArtifactKind, SnapshotDto<unknown>[]>
    const attachmentGroups = groupAttachments(refs)
    const latestOf = <T,>(kind: ArtifactKind): T | null => (byKind[kind]?.[0]?.payload as T | undefined) ?? null

    const payload = latestOf<{ idea?: string; genre?: string }>('idea')
    const nextCharacters = latestOf<Character[]>('characters') ?? []
    const nextActs = latestOf<Act[]>('acts') ?? []
    const nextEpisodes = latestOf<Episode[]>('episodes') ?? []
    const nextVisuals = backfillVisualCharacterEntityIds(
      latestOf<VisualCharacter[]>('visualCharacters') ?? [],
      nextCharacters,
    )
    const nextScenes = latestOf<AssetScene[]>('scenes') ?? []
    const nextPlaces = latestOf<VisualPlace[]>('visualPlaces') ?? []
    const nextShots = latestOf<Shot[]>('shots') ?? []

    const hasAnything =
      !!payload?.idea || nextCharacters.length > 0 || nextActs.length > 0 ||
      nextEpisodes.length > 0 || nextVisuals.length > 0 || nextScenes.length > 0 || nextShots.length > 0
    if (!hasAnything) return false

    setProjectId(pid)
    if (payload?.idea) setIdea(payload.idea)
    if (payload?.genre) setGenre(readGenre(payload.genre))
    setCharacters(nextCharacters)
    setActs(nextActs)
    setEpisodes(nextEpisodes)
    setVisuals(nextVisuals)
    setScenes(nextScenes)
    setPlaces(nextPlaces)
    setShots(nextShots)
    setAttached(attachmentGroups.characters)
    setPlaceAttached(attachmentGroups.places)

    // 恢复出来的就是各步最新版本，把「基于哪一版生成」对齐，
    // 否则一进来满屏都是「已过期」，用户会以为项目坏了
    const sig = JSON.stringify(nextCharacters)
    setActsBuiltFrom(sig)
    setEpisodesBuiltFrom(`${sig}|${JSON.stringify(nextActs)}`)
    setVisualsBuiltFrom(sig)
    setShotsBuiltFrom(`${sig}|${JSON.stringify(nextScenes)}`)
    return true
  }

  /** 重新拉项目列表；切项目 / 改名 / 删除 / 新建之后都要刷 */
  async function refreshProjects() {
    const list = await listProjects().catch(() => [])
    setProjects(list)
    return list
  }

  // 挂载时恢复「最近更新的那个项目」
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await listProjects().catch(() => [])
      if (cancelled) return
      setProjects(list)
      const requestedProjectId = readProjectQuery(window.location.search)
      const requestedProject = requestedProjectId
        ? list.find((project) => project.id === requestedProjectId) ?? null
        : null
      const targetProject = requestedProject ?? list[0] ?? null
      const linkInvalid = Boolean(requestedProjectId && !requestedProject)

      if (!targetProject) {
        if (requestedProjectId) {
          writeProjectToUrl(null, 'replace')
          setNotice('项目链接已失效，已打开空白工作台。')
        }
        return
      }

      const restored = await loadProject(targetProject.id).catch(() => false)
      if (cancelled) return
      if (!restored && requestedProject) setProjectId(targetProject.id)
      if (restored || requestedProject) writeProjectToUrl(targetProject.id, 'replace')
      if (linkInvalid) {
        writeProjectToUrl(restored ? targetProject.id : null, 'replace')
        setNotice(
          restored
            ? `项目链接已失效，已打开最近项目「${targetProject.title}」。`
            : '项目链接已失效，已打开空白工作台。',
        )
      } else if (restored && !requestedProject) {
        setNotice(`已恢复上次的项目「${targetProject.title}」，可以接着往下做。`)
      } else if (!restored && requestedProject) {
        setNotice('这个项目还没有内容，可以从故事灵感开始写。')
      }
    })()
    return () => { cancelled = true }
    // 只在挂载时跑一次；依赖的 setter 都是稳定的
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── 视觉定妆 ──────────────────────────────────────────────────
  const generateVisualAnchors = () =>
    runStep(
      "visuals",
      async () => {
        const pid = await ensureProject(idea.trim().slice(0, 20))
        const data = await generateVisuals(pid, idea.trim(), characters, genre.id, abortRef.current?.signal)
        return { ...data, pid }
      },
      (data) => {
        setVisuals(data.visualCharacters)
        setImagePrompts(data.imagePrompts as { name: string; zh: string; en: string }[])
        setVisualsBuiltFrom(charactersSig)
        // 定妆是新锚点的来源：生成完立刻问一次「下游有多少镜头还缺这个锚点」，
        // 用户不用先去点「重新定妆」才知道影响面（快照已在服务端落库，此时查得到）
        void refreshImpact(data.pid ?? undefined)
      },
    )

  // ── 场次 ──────────────────────────────────────────────────────
  const generateSceneList = () =>
    runStep(
      "scenes",
      async () => generateScenes(
        await ensureProject(idea.trim().slice(0, 20)),
        idea.trim(),
        characters,
        episodes,
        genre.id,
        abortRef.current?.signal,
      ),
      (data) => {
        setScenes(data.scenes)
        setPlaces(data.places ?? [])
      },
    )

  // ── 分镜（SSE 流式，复用现有 postSse）─────────────────────────
  const generateShotList = () => {
    if (shots.length > 0) recordJudgment('shots', '重新生成分镜')
    const epoch = resetEpoch.current
    const controller = new AbortController()
    abortRef.current = controller
    setStatus((st) => ({ ...st, shots: "streaming" }))
    setErrors((e) => ({ ...e, shots: null }))
    setShots([])
    setShotProgress(null)

    const builtFrom = `${charactersSig}|${JSON.stringify(scenes)}|${briefSig}|${lookSig}`

    ;(async () => {
      try {
        const pid = await ensureProject(idea.trim().slice(0, 20))
        await postSse(
          "/api/shots",
          { projectId: pid, idea: idea.trim(), genre: genre.id, characters, scenes, places, visualCharacters: visuals, acts, brief, look, resume: shotCheckpointRef.current },
          (event, data) => {
            if (isCleared(epoch)) return
            if (event === "resume") {
              const resume = data as { shots?: Shot[]; cursor?: number }
              if (resume.shots) {
                setShots(resume.shots.map((s) => applyLocalRefs(s, visuals, attached, placeAttached)))
              }
              if (resume.cursor) setShotProgress(`从第 ${resume.cursor} 场继续`)
              return
            }
            if (event === "progress") {
              const progress = data as { label?: string }
              if (progress.label) setShotProgress(progress.label)
              return
            }
            const payload = data as { shots?: Shot[] }
            if ((event === "shots" || event === "done") && payload.shots) {
              setShots(payload.shots.map((s) => applyLocalRefs(s, visuals, attached, placeAttached)))
            }
            if (event === "done") setShotProgress(null)
          },
          controller.signal,
        )
        if (isCleared(epoch)) return
        shotCheckpointRef.current = false
        setQuotaRefreshKey((n) => n + 1)
        setShotsBuiltFrom(builtFrom)
        setStatus((st) => ({ ...st, shots: "done" }))
        // 新一版分镜刚按当前锚点生成，这里查出来应当接近 0——查一次顺便验证锚点确实注入了
        void refreshImpact(pid ?? undefined)
      } catch (error) {
        if (isCleared(epoch)) return
        if (isAbortError(error)) {
          shotCheckpointRef.current = true
          // 停止流式分镜：已经推过来的镜头保留
          setStatus((st) => ({ ...st, shots: "idle" }))
          setNotice("已停止生成分镜。已经出来的镜头保留在工作台上。")
          return
        }
        const message = error instanceof Error ? error.message : "生成失败，请重试"
        shotCheckpointRef.current = true
        setErrors((e) => ({ ...e, shots: message }))
        setStatus((st) => ({ ...st, shots: "error" }))
        setNotice("已完成批次已保留；再点一次会从断点继续。")
      } finally {
        setShotProgress(null)
        if (abortRef.current === controller) abortRef.current = null
      }
    })()
  }

  // ── 打包带走（P2）─────────────────────────────────────────────
  const handleExportPackage = async () => {
    const enc = new TextEncoder()
    const entries: { name: string; data: Uint8Array }[] = []
    const title = idea.trim().slice(0, 20) || "未命名漫剧"
    const keyframeState = projectId
      ? await fetchProjectGenerationAssets(projectId).catch(() => ({ tasks: [], assets: [] }))
      : { tasks: [], assets: [] }
    const keyframes = keyframeState.assets

    const manifest = buildProjectPackageManifest({
      project: { id: projectId, title },
      exportedAt: Date.now(),
      story: { idea, characters, acts, episodes },
      assets: { visuals, scenes, places, shots },
      refs: [
        ...Object.entries(attached).flatMap(([name, keys]) =>
          keys.map((k) => ({ ownerType: "character", ownerId: name, vaultKey: k }))),
        ...Object.entries(placeAttached).flatMap(([name, keys]) =>
          keys.map((k) => ({ ownerType: "place", ownerId: name, vaultKey: k }))),
      ],
      keyframes: keyframes.map(keyframeManifestEntry),
    })

    entries.push({ name: "project.json", data: enc.encode(JSON.stringify(manifest, null, 2)) })
    entries.push({ name: "prompts.csv", data: enc.encode(shotsToCsv(shots)) })
    // 平台没有导入接口，所以除了 CSV 再给一份人类可读的执行清单
    entries.push({
      name: "shotlist.txt",
      data: enc.encode(shotsToWorkList(shots, `${title} · 分镜执行清单`)),
    })
    // 首尾帧清单：只勾了「接下一镜首帧」的镜头才有内容；一处都没勾时不占地方
    if (shots.some((s) => s.params.lastFrame)) {
      entries.push({
        name: "chaining.txt",
        data: enc.encode(shotsToChainingList(shots, `${title} · 首尾帧衔接清单`)),
      })
    }
    entries.push({ name: "storyboard.html", data: enc.encode(buildStoryboardHtml({ title, visuals, scenes, shots })) })
    entries.push({
      name: "README.txt",
      data: enc.encode([
        "成剧 · 项目包",
        "",
        "project.json      全部文本资产 + 角色视觉锚点 + 地点视觉锚点 + 分镜",
        "                  格式 chengju.project v1；读取器按 schemaVersion 兼容旧包",
        "prompts.csv       逐镜提示词（表格格式，含画面比例）",
        "shotlist.txt      逐镜执行清单（提示词 + 该带的参考图 + 参数），照着做即可",
        "chaining.txt      首尾帧衔接清单（哪一镜的尾帧接哪一镜的首帧）",
        "storyboard.html   离线可看的分镜表（双击用浏览器打开）",
        "keyframes/        已采用的云端关键帧（按角色 / 镜头分类）",
        "characters/       角色参考图（若从本地图库成功并入）",
        "places/           场景参考图（按地点名分目录）",
        "",
        "台词在 prompts.csv 与 shotlist.txt 里，是给配音和字幕用的文本；",
        "本工具不生成音频，配音在剪映或即梦那边做。",
        "",
        "说明：本地参考图不会上传；keyframes/ 只包含你主动云端生成并采用的图片。",
      ].join("\n")),
    })

    // 云端生成结果按当前采用版本并入；历史版本只保留 project.json 元数据。
    for (const asset of keyframes.filter((item) => item.selectedAt)) {
      try {
        const response = await fetch(asset.downloadUrl)
        if (!response.ok) continue
        entries.push({
          name: `keyframes/${asset.targetType}/${keyframeExportName(asset)}`,
          data: new Uint8Array(await response.arrayBuffer()),
        })
      } catch {
        // 单张关键帧下载失败不阻断文本与本地参考图交付
      }
    }

    // 把本地图库里的角色图并入包（从本地读，不经服务端）
    for (const [name, keys] of Object.entries(attached)) {
      for (const key of keys) {
        try {
          const blob = await getVaultBlob(key)
          if (!blob) continue
          entries.push({
            name: `characters/${name}/${key.split("/").pop() ?? "image.png"}`,
            data: new Uint8Array(await blob.arrayBuffer()),
          })
        } catch {
          // 单张图读不到不影响整体导出
        }
      }
    }

    // 场景图同样并入，放在 places/ 下——按地点名分目录，和 characters/ 对称
    for (const [name, keys] of Object.entries(placeAttached)) {
      for (const key of keys) {
        try {
          const blob = await getVaultBlob(key)
          if (!blob) continue
          entries.push({
            name: `places/${name}/${key.split("/").pop() ?? "image.png"}`,
            data: new Uint8Array(await blob.arrayBuffer()),
          })
        } catch {
          // 单张图读不到不影响整体导出
        }
      }
    }

    downloadBlob(`${title}-成剧项目包.zip`, buildZip(entries))
  }

  const handleCopyAll = async () => {
    const done = await copyText(markdown())
    setCopied(done)
    // 清掉上一个计时器，否则连点两次会提前把「已复制」收回去
    if (copyTimer.current) clearTimeout(copyTimer.current)
    if (done) copyTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  const handleCopyProjectLink = async () => {
    if (!projectId) {
      setNotice('请先打开或生成一个项目，再复制分享链接。')
      return
    }
    const url = new URL(window.location.href)
    url.search = withProjectQuery(url.search, projectId)
    const done = await copyText(url.toString())
    setNotice(done ? '项目链接已复制，打开后会回到当前项目与步骤。' : '复制失败，请稍后再试。')
  }

  const handleExport = () => {
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    downloadMarkdown(`成剧-大纲-${stamp}.md`, markdown())
  }

  const handleReset = () => {
    resetEpoch.current += 1 // 作废所有还在路上的请求
    setCharacters([])
    setActs([])
    setEpisodes([])
    setEpisodeSeed(null)
    setStatus(IDLE_STATUS)
    setErrors(IDLE_ERRORS)
    setActsBuiltFrom(null)
    setEpisodesBuiltFrom(null)
  }

  /**
   * 清空整个工作台（六步全清）。
   *
   * 和上面的「清空重来」不是一回事：那个只清前三个「写故事」的步骤，
   * 因为资产层有自己的「重新生成」。换项目必须全清，否则上一部戏的定妆、
   * 场景、分镜会挂在下一部戏下面——那是数据串台，不只是显示问题。
   */
  function clearWorkspace() {
    resetEpoch.current += 1
    setIdea('')
    setCharacters([])
    setActs([])
    setEpisodes([])
    setEpisodeSeed(null)
    setVisuals([])
    setImagePrompts([])
    setScenes([])
    setPlaces([])
    setAttached({})
    setPlaceAttached({})
    setShots([])
    setActiveShotId(null)
    setStatus(IDLE_STATUS)
    setErrors(IDLE_ERRORS)
    setActsBuiltFrom(null)
    setEpisodesBuiltFrom(null)
    setVisualsBuiltFrom(null)
    setShotsBuiltFrom(null)
    setImpact(null)
    setNotice(null)
  }

  /** 切到另一个项目：换工作台 = 全清 + 装载目标项目的快照 */
  async function handleSwitchProject(id: string) {
    if (id === projectId) return
    writeProjectToUrl(id, 'push')
    clearWorkspace()
    setProjectId(id)
    const restored = await loadProject(id).catch(() => false)
    if (!restored) setNotice('这个项目还没有内容，可以从故事灵感开始写。')
  }

  async function handleRenameProject(id: string, title: string) {
    try {
      await renameProject(id, title)
      await refreshProjects()
      setNotice(`项目已改名为「${title}」。`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '重命名失败，请重试')
    }
  }

  async function handleDeleteProject(id: string) {
    try {
      await deleteProject(id)
      // 删的正好是当前项目：工作台也一起清掉，免得用户在一个已经不存在的项目上继续写
      if (id === projectId) {
        clearWorkspace()
        setProjectId(null)
        writeProjectToUrl(null, 'replace')
      }
      await refreshProjects()
      setNotice('项目已删除，连带它的快照与图台账一起清掉了。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '删除失败，请重试')
    }
  }

  /** 新建：先给一张白纸，下一次生成时才真正落成项目 */
  function handleNewProject() {
    writeProjectToUrl(null, 'push')
    clearWorkspace()
    setProjectId(null)
    setNotice('已经开了一个空白工作台，写下想法点生成就会存成新项目。')
  }

  /**
   * 载入示例项目：第一次来的用户先看见"做出来是什么样"。
   * 走服务端写库（不调模型、不扣额度），所以刷新后它还在，也能当普通项目切走删掉。
   */
  async function handleLoadSample() {
    try {
      const { project } = await loadSampleProject()
      await refreshProjects()
      clearWorkspace()
      const restored = await loadProject(project.id).catch(() => false)
      if (!restored) throw new Error('示例没有载入成功，请重试')
      writeProjectToUrl(project.id, 'push')
      setNotice(`已载入示例项目「${project.title}」——六步都有内容，可以直接乱点着看。`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '示例载入失败，请重试')
    }
  }

  /**
   * 场记看到的状态快照。
   *
   * 只读快照是刻意的：工具拿到的是一份拷贝，它改不到真东西——
   * 「agent 不会擅自改稿」这条不只是提示词里的约定，是数据结构上的事实。
   */
  const agentState: AgentState = {
    projectTitle: projects.find((p) => p.id === projectId)?.title ?? idea.trim().slice(0, 20),
    hasIdea: idea.trim().length > 0,
    brief,
    judgments,
    episodes: episodes.map((e) => ({
      number: e.number,
      title: e.title,
      hook: e.hook,
      intensity: e.intensity,
    })),
    completed: stepCompleted,
    shots: shots.map((s) => ({
      shot: s.shot,
      scene: s.scene,
      characters: s.characters,
      missingRefFor: s.missingRefFor ?? [],
      status: s.status,
      shotSize: s.shotSize,
      camera: s.camera,
      prompt: s.prompt,
      speaker: s.speaker ?? '',
      dialogue: s.dialogue ?? '',
    })),
    expiredShots: impact?.expired ?? 0,
    quota: agentQuota,
  }

  /** 助手提议改写某一镜 → 用户确认后才真正写回（同放映厅那条「应用到本镜」） */
  function applyAgentCard(card: { shot: number; target: 'prompt' | 'action'; text: string; summary: string }) {
    setShots((prev) => prev.map((s) => (s.shot === card.shot ? { ...s, [card.target]: card.text } : s)))
    setNotice(`已按助手的建议改写第 ${card.shot} 镜（${card.summary}）。`)
  }

  /** 助手提议重跑某一步 → 切到那一步并触发生成 */
  function regenerateByAgent(step: StepKey) {
    const runners: Record<StepKey, () => void> = {
      characters: generateCharacters,
      acts: generateActs,
      episodes: () => { void generateEpisodes() },
      visuals: generateVisualAnchors,
      scenes: generateSceneList,
      shots: generateShotList,
    }
    goToStep(step)
    setNotice(`按助手的建议重新生成「${STEPS.find((s) => s.key === step)?.nav}」。`)
    runners[step]()
  }

  /** 画布节点 → 对应步骤 + 场记，问题预先带入但不自动发送 */
  function askAgentFromCanvas(step: StepKey, label: string) {
    tabTouched.current = true
    setCanvasOpen(false)
    setDeckOpen(true)
    setAgentOpen(true)
    goToStep(step)
    setAgentSeed({
      id: Date.now(),
      text: `请检查「${label}」这个节点：当前有哪些问题，下一步应该怎么处理？`,
    })
  }

  // 过期提示条
  const staleNotice = (text: string) => (
    <div className="mb-4 flex items-start gap-2 rounded-card border border-accent-200 bg-accent-50 px-3.5 py-2.5">
      <svg viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0 text-accent-500">
        <path
          fillRule="evenodd"
          d="M8.5 2.5a1.75 1.75 0 0 1 3 0l6.2 11a1.75 1.75 0 0 1-1.5 2.6H3.8a1.75 1.75 0 0 1-1.5-2.6l6.2-11ZM10 7a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 7Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      <p className="text-xs leading-relaxed text-accent-800">{text}</p>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/*
        顶栏：一层楼高，品牌在左、硬指标与自建入口在右（对齐 concept-reference.png）。
        底部那道朱砂细线是全站唯一的分隔装饰，代替原来的居中 hero。
      */}
      {/* 顶栏：与 demo 完全一致——左边品牌 + AI 徽标，右边齿轮与头像 */}
      {/* 顶栏吸顶：向下滚动时品牌与额度一直可见 */}
      <header className="h-top">
        <div className="h-lockup">
          <h1 className="h-brand">成剧</h1>
          <span className="h-wordmark">VEYAFRAME</span>
        </div>
        <span className="h-ai" title="全流程 AI 生成">AI</span>
        <span className="h-slogan hidden lg:inline">一句想法 → 能出图的分镜</span>
        <span className="h-div hidden lg:block" aria-hidden="true" />
        <QuotaBar refreshKey={quotaRefreshKey} inline episodeCount={episodeCount} />

        <StepPills
          current={viewIndex}
          completed={stepCompleted}
          onJump={goToStep}
          canJump={canJump}
        />

        <button
          type="button"
          className="h-canvas"
          onClick={() => setCanvasOpen(true)}
          title="查看六步项目画布"
          aria-label="打开项目画布"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="6" r="2.2" />
            <circle cx="19" cy="6" r="2.2" />
            <circle cx="12" cy="18" r="2.2" />
            <path d="M7.2 6h9.6M6.2 8l4.6 8M17.8 8l-4.6 8" />
          </svg>
          <span>画布</span>
        </button>

        <span className={`h-run ${anyRunning ? 'busy' : ''}`} aria-live="polite">
          <i aria-hidden="true" />
          {anyRunning ? `生成中 · ${elapsed.toFixed(1)}s` : `${completedCount}/6 已完成`}
        </span>

        <PwaInstallButton />
        <PushNotificationButton />
        <AuthButton />

        <ReleaseNotice />

        <ul className="hidden flex-wrap items-center gap-1.5 2xl:flex">
          {['零部署', '图不上传', '一键打包带走'].map((tag) => (
            <li key={tag} className="rounded-pill bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-ink-600">
              {tag}
            </li>
          ))}
        </ul>

        <a
          href="https://github.com/felixfeng-ai/shortdrama-outline"
          target="_blank"
          rel="noreferrer"
          title="代码在这里，可以拿去自建"
          className="rounded-full p-1.5 text-ink-500 transition-colors hover:bg-surface-soft
            hover:text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
            <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.4 9.4 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
          </svg>
        </a>
      </header>

      {canvasOpen && (
        <ProjectCanvas
          current={view}
          completed={stepCompleted}
          counts={{ ...canvasCounts, placeGaps: missingPlaces }}
          issues={canvasIssues}
          previews={canvasPreviews}
          onEdit={handleCanvasEdit}
          onLoadVersions={loadCanvasVersions}
          onRestoreVersion={restoreCanvasVersion}
          onOpen={(step) => {
            setCanvasOpen(false)
            goToStep(step)
          }}
          onAskAgent={askAgentFromCanvas}
          onClose={() => setCanvasOpen(false)}
        />
      )}

      <div className="h-main">
        <aside className="signal-rail" aria-label="创作步骤">
          <span className="signal-rail-logo" aria-hidden="true">V</span>
          <button
            type="button"
            className="signal-rail-canvas"
            onClick={() => setCanvasOpen(true)}
            title="打开项目画布"
            aria-label="打开项目画布"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="5" cy="6" r="2.2" />
              <circle cx="19" cy="6" r="2.2" />
              <circle cx="12" cy="18" r="2.2" />
              <path d="M7.2 6h9.6M6.2 8l4.6 8M17.8 8l-4.6 8" />
            </svg>
          </button>
          <SideNav
            current={viewIndex}
            completed={stepCompleted}
            onJump={goToStep}
            canJump={canJump}
          />
          <span className="signal-rail-label" aria-hidden="true">FLOW</span>
        </aside>
        <main className="h-work">
          {variantSession && (
            <VariantPicker
              stepLabel={
                variantSession.step === 'characters'
                  ? '核心人物'
                  : variantSession.step === 'acts'
                    ? '三幕大纲'
                    : '第一集'
              }
              options={
                variantSession.step === 'characters'
                  ? [
                      {
                        id: 'A' as const,
                        title: `${variantSession.a.length} 个角色`,
                        lines: variantSession.a.map((c) => `${c.name} · ${c.motivation}`),
                      },
                      {
                        id: 'B' as const,
                        title: `${variantSession.b.length} 个角色`,
                        lines: variantSession.b.map((c) => `${c.name} · ${c.motivation}`),
                      },
                    ]
                  : variantSession.step === 'acts'
                    ? [
                      {
                        id: 'A' as const,
                        title: '三幕 A',
                        lines: variantSession.a.map((a) => `${a.title}：${a.summary.slice(0, 50)}`),
                      },
                      {
                        id: 'B' as const,
                        title: '三幕 B',
                        lines: variantSession.b.map((a) => `${a.title}：${a.summary.slice(0, 50)}`),
                      },
                      ]
                    : [
                        {
                          id: 'A' as const,
                          title: `第 1 集 · ${variantSession.a[0].title}`,
                          lines: [variantSession.a[0].synopsis, `钩子：${variantSession.a[0].hook}`],
                        },
                        {
                          id: 'B' as const,
                          title: `第 1 集 · ${variantSession.b[0].title}`,
                          lines: [variantSession.b[0].synopsis, `钩子：${variantSession.b[0].hook}`],
                        },
                      ]
              }
              onPick={pickVariant}
              onCancel={() => setVariantSession(null)}
            />
          )}
          <div className="mb-3">
            <ProjectBar
                  projects={projects}
                  currentId={projectId}
                  hasContent={hasResult}
                  onSwitch={(id) => { void handleSwitchProject(id) }}
                  onRename={(id, title) => { void handleRenameProject(id, title) }}
                  onDelete={(id) => { void handleDeleteProject(id) }}
                  onNew={handleNewProject}
                  onLoadSample={() => { void handleLoadSample() }}
                  onBackup={() => { void handleExportPackage() }}
                  onExportMarkdown={handleExport}
                  onCopyAll={() => { void handleCopyAll() }}
                  onCopyLink={() => { void handleCopyProjectLink() }}
                  copied={copied}
                />
                {/* 空工作台时给一条最短的上手路径：先看示例长什么样 */}
                {!hasResult && (
                  <button
                    type="button"
                    onClick={() => { void handleLoadSample() }}
                    className="mt-2 w-full rounded-card border border-dashed border-surface-line-2 px-3 py-2 text-[11px]
                      text-ink-500 transition-colors hover:border-accent-300 hover:bg-accent-50/50 hover:text-accent-700"
                  >
                    第一次来？载入示例项目看看六步的样子
                  </button>
                )}
                <div className="mt-2">
                  <GenerationTaskPanel
                    projectId={projectId}
                    visuals={visuals}
                    shots={shots}
                    look={look}
                  />
                </div>
              </div>
              <IdeaPanel
              key={view === 'characters' ? 'characters' : view}
              idea={idea}
              onIdeaChange={setIdea}
              genre={genre}
              onGenreChange={setGenre}
              onGenerate={generateCharacters}
              onReset={handleReset}
              loading={status.characters === 'loading'}
              hasResult={hasResult}
              firstRun={firstRun}
              compact={view !== 'characters'}
              allowGenerate={view === 'characters'}
            />

            <SignalOverview
              current={viewIndex}
              completed={stepCompleted}
              onJump={goToStep}
              canJump={canJump}
              todoCount={todoItems.length}
              shotDone={shots.filter((shot) => shot.status === 'done').length}
              shotTotal={shots.length}
            />

          <div className="mt-5 space-y-4">
            {/*
              项目待办：把散在六个分区里的状态收成一张清单（只读，不写任何东西）。
              某一步一生成完，下一屏不用再翻——该做什么、哪里要修，都在这里。
            */}
            {!firstRun && (
            <div>
            <WorkMeta
              briefFilled={!isBriefEmpty(brief)}
              todoCount={todoItems.length}
              logCount={judgments.length}
              active={metaPanel}
              onToggle={(panel) => setMetaPanel(metaPanel === panel ? null : panel)}
            />
            <BriefCard
              headless
              open={metaPanel === 'brief'}
              value={brief}
              onChange={setBrief}
              onOpenChange={(v) => { if (!v) setMetaPanel(null) }}
            />
            <TodoPanel
              headless
              open={metaPanel === 'todo'}
              items={todoItems}
              onGo={goToStep}
              onOpenChange={(v) => { if (!v) setMetaPanel(null) }}
            />
            <JudgmentLogPanel
              headless
              open={metaPanel === 'log'}
              entries={judgments}
              onAdd={(reason) => recordJudgment('manual', '手记', reason)}
              onOpenChange={(v) => { if (!v) setMetaPanel(null) }}
            />
            </div>
            )}
            {/* 第一步：人物 */}
            <StepSection
              {...nextProps}
              index={1}
              anchorId={STEP_ANCHORS.characters}
              visible={view === 'characters'}
              onCancel={cancelRun}
              title={STEPS[0].title}
              subtitle={STEPS[0].subtitle}
              status={status.characters}
              error={errors.characters}
              hasContent={hasCharacters}
              // 第一步没有前置步骤，它的「前置条件」是还没输入想法。
              // 不锁的话这里的按钮会一直亮着，而左侧那个同样功能的按钮是灰的。
              locked={idea.trim().length < MIN_IDEA_LENGTH}
              lockedHint="先在「故事灵感」里写下想法，再点「生成人物」"
              actionLabel="生成人物"
              onGenerate={generateCharacters}
              skeletonVariant="characters"
              extraAction={
                <>
                  <button
                    type="button"
                    onClick={() => { void requestVariants('characters') }}
                    disabled={variantLoading || status.characters === 'loading'}
                    title="一次生成两版人物，消耗 2 单位"
                    className="rounded-chip border border-accent-300 bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700
                      transition-colors hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {variantLoading ? '生成两版…' : '两版对比'}
                  </button>
                  {characters.length < 5 ? (
                    <button
                      type="button"
                      onClick={addCharacter}
                      disabled={addingCharacter || status.characters === 'loading'}
                      className="rounded-chip border border-ink-200 px-3 py-2 text-xs font-medium text-ink-600
                        transition-colors hover:border-accent-300 hover:bg-accent-50 hover:text-accent-700
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-300
                        disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {addingCharacter ? '添加中…' : '+ 添加角色'}
                    </button>
                  ) : null}
                </>
              }
            >
              <CharacterList
                characters={characters}
                onChange={setCharacters}
                onRegenerate={regenerateCharacter}
                regeneratingId={regeneratingId}
                attached={attached}
                matchNotes={matchNotes}
              />
            </StepSection>

            {/* 第二步：三幕大纲 */}
            <StepSection
              {...nextProps}
              index={2}
              anchorId={STEP_ANCHORS.acts}
              visible={view === 'acts'}
              onCancel={cancelRun}
              title={STEPS[1].title}
              subtitle={STEPS[1].subtitle}
              status={status.acts}
              error={errors.acts}
              hasContent={hasActs}
              locked={!hasCharacters}
              lockedHint="请先生成核心人物，三幕大纲会基于人物展开"
              actionLabel="三幕大纲"
              onGenerate={generateActs}
              skeletonVariant="acts"
              extraAction={
                <button
                  type="button"
                  onClick={() => { void requestVariants('acts') }}
                  disabled={variantLoading || status.acts === 'loading'}
                  title="一次生成两版三幕大纲，消耗 2 单位"
                  className="rounded-chip border border-accent-300 bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700
                    transition-colors hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {variantLoading ? '生成两版…' : '两版对比'}
                </button>
              }
            >
              {actsStale && staleNotice('人物设定已改动，当前三幕大纲是基于旧人物生成的，建议重新生成一次。')}
              <ActList acts={acts} onChange={setActs} />
            </StepSection>

            {/* 第三步：分集剧情 */}
            <StepSection
              {...nextProps}
              index={3}
              anchorId={STEP_ANCHORS.episodes}
              visible={view === 'episodes'}
              onCancel={cancelRun}
              title={STEPS[2].title}
              subtitle={STEPS[2].subtitle}
              status={status.episodes}
              error={errors.episodes}
              hasContent={hasEpisodes}
              locked={!hasActs}
              lockedHint="请先生成三幕大纲，分集剧情会基于大纲拆分"
              actionLabel="分集"
              onGenerate={generateEpisodes}
              skeletonVariant="episodes"
              actionHint={`${episodeCount} 集 · 约 ${episodeQuotaUnits(episodeCount)} 单位 · ${episodeTimeEstimate(episodeCount)}`}
            >
              <EpisodeCountPicker
                value={episodeCount}
                onChange={setEpisodeCount}
                existing={episodes.length}
                disabled={status.episodes === 'streaming' || status.episodes === 'loading'}
              />
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => { void requestFirstEpisodes() }}
                  disabled={variantLoading || !hasActs}
                  title="各生成 1 集第一集方向，共消耗 2 单位"
                  className="rounded-chip border border-accent-300 bg-accent-50 px-3 py-1.5 text-[11.5px] font-medium text-accent-700
                    transition-colors hover:bg-accent-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {variantLoading ? '生成第一集中…' : '第一集开两个方向'}
                </button>
                {episodeSeed && (
                  <span className="text-[11px] text-ink-500">
                    已选定第一集「{episodeSeed.title}」· 生成会从第 2 集接着写
                  </span>
                )}
              </div>
              {episodesStale && staleNotice('上游内容已改动，当前分集是基于旧版本生成的，建议重新生成一次。')}
              <PacingCurve episodes={episodes} />
              <EpisodeList episodes={episodes} onChange={setEpisodes} />
            </StepSection>

            {/* 第四步：角色视觉定妆（资产层） */}
            <StepSection
              {...nextProps}
              index={4}
              anchorId={STEP_ANCHORS.visuals}
              visible={view === 'visuals'}
              onCancel={cancelRun}
              title={STEPS[3].title}
              subtitle={STEPS[3].subtitle}
              status={status.visuals}
              error={errors.visuals}
              hasContent={visuals.length > 0}
              locked={!hasCharacters}
              lockedHint="请先生成核心人物，再为他们定妆"
              actionLabel="视觉定妆"
              onGenerate={generateVisualAnchors}
              skeletonVariant="characters"
            >
              <LookBookCard value={look} onChange={setLook} />
              {visuals.length > 0 && (
                <VersionBar
                  stale={visualsBuiltFrom !== charactersSig}
                  staleReason={
                    visualsBuiltFrom !== charactersSig ? "人物设定已改动" : null
                  }
                  affectedShots={impact?.affected ?? 0}
                  expiredShots={impact?.expired ?? 0}
                  lockedTraitShots={impact?.lockedTraitShots ?? 0}
                  lockedTraitIssues={impact?.lockedTraitIssues ?? []}
                  onRebuild={generateVisualAnchors}
                  actionLabel="视觉定妆"
                />
              )}
              <VisualAnchorPanel
                visuals={visuals}
                onChange={setVisuals}
                imagePrompts={imagePrompts}
                vaultFiles={vaultFiles}
                attached={attached}
                onAttach={attachImage}
                onDetach={detachImage}
                projectId={projectId}
                onEnsureProject={() => ensureProject(idea.trim().slice(0, 20))}
                look={look}
              />
            </StepSection>

            {/* 第五步：场景 */}
            <StepSection
              {...nextProps}
              index={5}
              anchorId={STEP_ANCHORS.scenes}
              visible={view === 'scenes'}
              onCancel={cancelRun}
              title={STEPS[4].title}
              subtitle={STEPS[4].subtitle}
              status={status.scenes}
              error={errors.scenes}
              hasContent={scenes.length > 0}
              locked={!hasEpisodes}
              lockedHint="请先生成分集剧情，再拆场景"
              actionLabel="场景"
              onGenerate={generateSceneList}
              skeletonVariant="acts"
            >
              {/* 地点锚点排在场次前面：它由场次这次调用一起产出，但作用范围是全剧 */}
              <PlacePanel
                places={places}
                onChange={setPlaces}
                missing={[...new Set(scenes.map((s) => s.location))]
                  .filter((loc) => loc && !places.some((p) => p.name === loc))}
                vaultFiles={vaultFiles}
                attached={placeAttached}
                onAttach={attachPlaceImage}
                onDetach={detachPlaceImage}
              />
              <SceneList scenes={scenes} onChange={setScenes} />
            </StepSection>

            {/* 第六步：分镜（流式） */}
            <StepSection
              {...nextProps}
              index={6}
              anchorId={STEP_ANCHORS.shots}
              visible={view === 'shots'}
              onCancel={cancelRun}
              title={STEPS[5].title}
              subtitle={STEPS[5].subtitle}
              status={status.shots}
              error={errors.shots}
              hasContent={shots.length > 0}
              locked={!hasActs || scenes.length === 0}
              lockedHint="请先生成三幕大纲与场景，再拆镜头"
              actionLabel="分镜"
              onGenerate={generateShotList}
              skeletonVariant="episodes"
            >
              {shots.length > 0 && (
                <VersionBar
                  stale={shotsBuiltFrom !== `${charactersSig}|${JSON.stringify(scenes)}|${briefSig}|${lookSig}`}
                  staleReason={
                    shotsBuiltFrom !== `${charactersSig}|${JSON.stringify(scenes)}|${briefSig}|${lookSig}`
                      ? "上游内容已改动"
                      : null
                  }
                  affectedShots={impact?.affected ?? 0}
                  expiredShots={impact?.expired ?? 0}
                  lockedTraitShots={impact?.lockedTraitShots ?? 0}
                  lockedTraitIssues={impact?.lockedTraitIssues ?? []}
                  onRebuild={generateShotList}
                  actionLabel="生成分镜"
                />
              )}
              {shots.length > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <CopyButton
                    text={shots.map((s) => `#${s.shot} ${s.scene}\n${s.prompt}`).join('\n\n')}
                    label="复制全部提示词"
                  />
                  {/* 全片执行清单：一次拿到所有镜头的工作单，配合平台逐个执行 */}
                  <CopyButton
                    text={shotsToWorkList(shots, `${idea.trim().slice(0, 20) || '未命名漫剧'} · 分镜执行清单`)}
                    label="复制全部执行清单"
                  />
                  {/* 首尾帧衔接：勾了「接下一镜首帧」才出现——勾完就多一个按钮，是直接的反馈 */}
                  {shots.some((s) => s.params.lastFrame) && (
                    <CopyButton
                      text={shotsToChainingList(shots, `${idea.trim().slice(0, 20) || '未命名漫剧'} · 首尾帧衔接清单`)}
                      label="复制衔接清单"
                    />
                  )}
                </div>
              )}
              <ShotList
                shots={shots}
                progress={shotProgress}
                onChange={setShots}
                activeShotId={activeShot?.id ?? null}
                onSelect={setActiveShotId}
                projectId={projectId}
                onEnsureProject={() => ensureProject(idea.trim().slice(0, 20))}
                look={look}
              />
            </StepSection>

            {/* 挂接结果 / AI 兜底：把「图有没有对上角色」这件事讲清楚 */}
            {vaultFiles.length > 0 && characterNames.length > 0 && (
              <AttachReview
                summary={attachSummary}
                detail={matchDetail}
                vaultFiles={vaultFiles}
                attached={attached}
                unmatched={attachSummary?.unmatched ?? []}
                suggestions={aiSuggestions}
                note={aiNote}
                busy={matching}
                onAskAi={askAiToMatch}
                onAccept={acceptSuggestion}
                onDismiss={(key: string) => setAiSuggestions((prev) => prev.filter((x) => x.key !== key))}
              />
            )}

            {(view === 'visuals' || view === 'scenes') && (
              <VaultPanel
                mode={vaultMode}
                files={vaultFiles}
                onPickDirectory={handlePickDirectory}
                onReload={handleReloadVault}
                onAdd={(added) => setAllVaultFiles((prev) => [...prev, ...added])}
                onIgnore={handleIgnoreVaultFile}
                ignoredCount={ignoredKeys.length}
                onRestore={handleRestoreVaultFiles}
                onClear={handleClearVault}
              />
            )}

            {view === 'characters' && (
              <VaultPanel
                compact
                mode={vaultMode}
                files={vaultFiles}
                onPickDirectory={handlePickDirectory}
                onReload={handleReloadVault}
                onAdd={(added) => setAllVaultFiles((prev) => [...prev, ...added])}
                onIgnore={handleIgnoreVaultFile}
                ignoredCount={ignoredKeys.length}
                onRestore={handleRestoreVaultFiles}
                onClear={handleClearVault}
                onManage={() => goToStep('visuals')}
              />
            )}

            {view === 'shots' && shotMissingRefs.length > 0 && (
              <div className="shot-asset-gap surface flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
                <span className="shrink-0 text-[11px] font-semibold text-accent-800">素材缺口</span>
                <p className="min-w-[12rem] flex-1 text-[11px] leading-relaxed text-ink-500">
                  缺少 {shotMissingRefs.length} 个角色参考图：{shotMissingRefs.slice(0, 3).join('、')}
                  {shotMissingRefs.length > 3 ? ` 等 ${shotMissingRefs.length} 人` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => goToStep('visuals')}
                  className="min-h-10 shrink-0 rounded-pill bg-accent-700 px-2.5 py-1 text-[11px] font-medium text-white
                    transition-colors hover:bg-accent-800"
                >
                  去定妆补图
                </button>
              </div>
            )}

            {/* 一页只画一步，底部留出放映厅的高度，保证内容能滚到它上面 */}
            {/* 这一步做完之后的去处：主线下一站 + 顺手解锁的资产步骤 */}
            {stepCompleted[view] && (nextStep || sideStep) && (
              <div className="surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs text-ink-600">
                    「{stepOf(view)?.nav}」已经生成完了。
                  </p>
                  {sideStep && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-500">{sideStep.note}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {sideStep && (
                    <button
                      type="button"
                      onClick={() => goToStep(sideStep.key)}
                      className="rounded-pill border border-accent-300 bg-accent-50 px-3.5 py-1.5 text-[11px]
                        font-medium text-accent-700 transition-colors hover:bg-accent-100"
                    >
                      去{stepOf(sideStep.key)?.nav}
                    </button>
                  )}
                  {nextStep && (
                    <button
                      type="button"
                      onClick={() => goToStep(nextStep)}
                      className="rounded-pill bg-accent-600 px-4 py-2 text-xs font-medium text-white
                        transition-colors hover:bg-accent-700"
                    >
                      下一步：{stepOf(nextStep)?.nav} →
                    </button>
                  )}
                </div>
              </div>
            )}

          </div>

          {notice && (
            <div className="work-toast" role="status" aria-live="polite">
              <p>{notice}</p>
              <button type="button" onClick={() => setNotice(null)} aria-label="知道了">知道了</button>
            </div>
          )}
        </main>

        {/*
          产出舱：H 的右半屏。
          data-theme 让它内部直接继承墨层 token；两个 tab 常驻挂载，
          切走只是 display:none，对话与滚动位置都不会丢。
        */}
        {deckOpen && (
          <div
            className="h-deck-scrim"
            aria-hidden="true"
            onClick={() => setDeckOpen(false)}
          />
        )}
        <aside
          className={`h-deck ${deckOpen ? 'open' : ''}`}
          data-theme="paper-light-dark-ai"
          aria-label="产出舱"
        >
          {/* 窄屏抓手：收起时就是一条「› 问进度、改某一镜…」的输入行 */}
          <button
            type="button"
            className="h-deck-grab"
            aria-expanded={deckOpen}
            aria-controls="deck-body"
            aria-label={deckOpen ? '收起产出舱' : '展开产出舱'}
            onClick={() => {
              // 收起时这一行写的是「问进度、改某一镜」——展开就该落在场记，
              // 而不是把用户丢到「产出」tab 再自己找一遍
              if (!deckOpen) setAgentOpen(true)
              setDeckOpen((v) => !v)
            }}
          >
            <span className="h-deck-grab-handle" aria-hidden="true" />
            <span className="h-deck-grab-row" aria-hidden="true">
              <span className="car">›</span>
              <span className="txt">问进度、改某一镜…</span>
              {!deckOpen && agentUnread > 0 && (
                <span className="h-deck-grab-count">{agentUnread > 9 ? '9+' : agentUnread}</span>
              )}
              <span className="go">↵</span>
            </span>
          </button>
          <div className="h-deck-tabs" role="tablist" aria-label="产出舱视图">
            <button
              type="button"
              role="tab"
              id="deck-tab-output"
              aria-selected={!agentOpen}
              aria-controls="deck-pane-output"
              className={`h-deck-tab ${agentOpen ? '' : 'on'}`}
              onClick={() => { tabTouched.current = true; setAgentOpen(false) }}
            >
              产出
            </button>
            <button
              type="button"
              role="tab"
              id="deck-tab-agent"
              aria-selected={agentOpen}
              aria-controls="deck-pane-agent"
              className={`h-deck-tab ${agentOpen ? 'on' : ''}`}
              onClick={() => { tabTouched.current = true; setAgentOpen(true) }}
            >
              场记
              {!agentOpen && agentUnread > 0 && (
                <span className="h-deck-badge" aria-label={`${agentUnread} 条新消息`}>
                  {agentUnread > 9 ? '9+' : agentUnread}
                </span>
              )}
            </button>
            <span className="h-deck-meta">
              {anyRunning
                ? `生成中 · ${elapsed.toFixed(1)}s`
                : `SHOT ${activeShot ? String(activeShot.shot).padStart(2, '0') : '--'}`}
            </span>
          </div>

          <div className="h-deck-body" id="deck-body">
            <div
              className="h-deck-pane"
              id="deck-pane-output"
              role="tabpanel"
              aria-labelledby="deck-tab-output"
              style={{ display: agentOpen ? 'none' : 'flex' }}
            >
              <AssistantDock
                shot={activeShot}
                idea={idea}
                genre={genre}
                characters={characters}
                onApply={applyAssistantText}
              />
            </div>
            <div
              className="h-deck-pane"
              id="deck-pane-agent"
              role="tabpanel"
              aria-labelledby="deck-tab-agent"
              style={{ display: agentOpen ? 'flex' : 'none' }}
            >
              <AgentDock
                variant="docked"
                state={agentState}
                open
                onOpenChange={setAgentOpen}
                onNewMessage={() => {
                  // 正停在场记里就不用提示；停在产出/别的步骤才点亮角标
                  if (!agentOpen) setAgentUnread((n) => n + 1)
                }}
                context={
                  view === 'shots' && activeShot
                    ? `第 ${activeShot.shot} 镜 · ${activeShot.scene || '未命名场景'}`
                    : `第 ${viewIndex} 步 · ${stepOf(view)?.nav ?? ''}`
                }
                onApplyCard={applyAgentCard}
                onRegenerate={regenerateByAgent}
                onOpenStep={(step) => {
                  goToStep(step)
                  if (window.matchMedia('(max-width: 920px)').matches) setDeckOpen(false)
                }}
                seedPrompt={agentSeed}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
