'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ActList from '@/components/ActList'
import CharacterList from '@/components/CharacterList'
import AttachReview from '@/components/AttachReview'
import EpisodeList from '@/components/EpisodeList'
import IdeaPanel from '@/components/IdeaPanel'
import StepIndicator from '@/components/StepIndicator'
import StepSection from '@/components/StepSection'
import ShotList from '@/components/ShotList'
import SceneList from '@/components/SceneList'
import VisualAnchorPanel from '@/components/VisualAnchorPanel'
import VaultPanel from '@/components/VaultPanel'
import VersionBar from '@/components/VersionBar'
import CopyButton from '@/components/CopyButton'
import {
  createProject,
  generateVisuals,
  generateScenes,
  registerRefs,
  listSnapshots,
  findImpact,
} from '@/lib/assets/api'
import type { Shot, VisualCharacter, Scene as AssetScene } from '@/lib/assets/types'
import {
  detectVaultMode,
  loadDirectoryHandle,
  pickDirectory,
  listImages,
  listVaultFiles,
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
  shotsToWorkList,
  buildZip,
  downloadBlob,
} from '@/lib/assets/export'
import { postJson, postSse } from '@/lib/api'
import { buildMarkdown, copyText, downloadMarkdown } from '@/lib/export'
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

function jumpToStep(key: StepKey) {
  document.getElementById(STEP_ANCHORS[key])?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

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
  const [shots, setShots] = useState<Shot[]>([])
  // 影响范围：改一处之后实际受影响的下游数量（由 /api/impact 从血缘反查得出）
  const [impact, setImpact] = useState<{ affected: number; expired: number } | null>(null)
  const [vaultMode, setVaultMode] = useState<VaultMode>('indexeddb')
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([])
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

  // 上游改过之后，下游结果就是基于旧版本生成的
  const actsStale = hasActs && actsBuiltFrom !== charactersSig
  const episodesStale = hasEpisodes && episodesBuiltFrom !== `${charactersSig}|${actsSig}`

  const isCleared = (epoch: number) => resetEpoch.current !== epoch

  // ── 通用：跑一个步骤，统一处理 loading / error / 被清空 ──
  async function runStep<T>(step: StepKey, task: () => Promise<T>, onSuccess: (data: T) => void) {
    const epoch = resetEpoch.current
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
      const message = error instanceof Error ? error.message : '生成失败，请重试'
      setErrors((e) => ({ ...e, [step]: message }))
      setStatus((s) => ({ ...s, [step]: 'error' }))
    }
  }

  // ── 第一步：生成人物 ──
  const generateCharacters = () =>
    runStep(
      'characters',
      () => postJson<{ characters: Character[] }>('/api/characters', { idea: idea.trim(), genre: genre.id }),
      ({ characters: list }) => setCharacters(list),
    )

  /** 只换掉某一个角色 */
  const regenerateCharacter = async (id: string) => {
    const epoch = resetEpoch.current
    setRegeneratingId(id)
    setErrors((e) => ({ ...e, characters: null }))
    try {
      const data = await postJson<{ characters: Character[] }>('/api/characters', {
        idea: idea.trim(),
        genre: genre.id,
        mode: 'single',
        existing: characters.filter((c) => c.id !== id),
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
      () => postJson<{ acts: Act[] }>('/api/acts', { idea: idea.trim(), genre: genre.id, characters }),
      ({ acts: list }) => {
        setActs(list)
        setActsBuiltFrom(charactersSig) // 记下这批大纲是基于哪一版人物生成的
      },
    )

  // ── 第三步：生成分集（流式，一集一集出现）──
  // 这里不复用 runStep：它的 task 只在全部完成时返回一次结果，
  // 而流式需要在接收过程中就反复更新界面。
  const generateEpisodes = async () => {
    const epoch = resetEpoch.current
    const builtFrom = `${charactersSig}|${actsSig}`

    setStatus((s) => ({ ...s, episodes: 'streaming' }))
    setErrors((e) => ({ ...e, episodes: null }))
    // 先清空，重新生成时才看得出是一集集新出现的，而不是新旧混在一起
    setEpisodes([])

    let finished = false
    try {
      await postSse('/api/episodes', { idea: idea.trim(), genre: genre.id, characters, acts }, (event, data) => {
        if (isCleared(epoch)) return
        if (event !== 'episodes' && event !== 'done') return

        setEpisodes((data as { episodes: Episode[] }).episodes)
        // 拿到的这一份就是基于当前上游生成的，标记一下，免得触发「已过期」提示
        setEpisodesBuiltFrom(builtFrom)

        if (event === 'done') {
          finished = true
          setQuotaRefreshKey((n) => n + 1)
          setStatus((s) => ({ ...s, episodes: 'done' }))
        }
      })

      // 连接断了却没收到 done：不能把界面永远停在「生成中…」
      if (!finished) throw new Error('生成中断，请重试')
    } catch (error) {
      if (isCleared(epoch)) return
      const message = error instanceof Error ? error.message : '生成失败，请重试'
      setErrors((e) => ({ ...e, episodes: message }))
      setStatus((s) => ({ ...s, episodes: 'error' }))
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
   * 这是「改一处、算得出影响了谁」在界面上的落点。做成显式触发而不是每次
   * 输入都查，是因为它要打两个接口；等用户真正想知道影响时才问。
   */
  async function refreshImpact() {
    if (!projectId) return
    try {
      const snaps = await listSnapshots<unknown>(projectId, "visualCharacters")
      const latestVc = snaps[0]
      if (!latestVc) return

      const affected = await findImpact(latestVc.id)
      const shotSnaps = affected.filter((s) => s.kind === "shots")
      // 过期口径：受影响镜头快照里，payload 中提示词与当前锚点对不上的镜头数
      let expired = 0
      for (const s of shotSnaps) {
        const list = Array.isArray(s.payload) ? (s.payload as Shot[]) : []
        expired += list.filter((shot) => shot.status !== "done").length
      }

      setImpact({ affected: affected.length, expired })
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
    setVaultFiles(files)
    autoAttachByFolder(files)
  }

  async function handleReloadVault() {
    const handle = await loadDirectoryHandle()
    if (!handle) return
    const files = await listImages(handle).catch(() => [])
    setVaultFiles(files)
    autoAttachByFolder(files)
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
    listVaultFiles().then(setVaultFiles).catch(() => {})
    loadDirectoryHandle()
      .then(async (h) => { if (h) setVaultFiles(await listImages(h).catch(() => [])) })
      .catch(() => {})
  }, [])

  // ── 视觉定妆 ──────────────────────────────────────────────────
  const generateVisualAnchors = () =>
    runStep(
      "visuals",
      async () => generateVisuals(await ensureProject(idea.trim().slice(0, 20)), idea.trim(), characters, genre.id),
      (data) => {
        setVisuals(data.visualCharacters)
        setImagePrompts(data.imagePrompts as { name: string; zh: string; en: string }[])
        setVisualsBuiltFrom(charactersSig)
      },
    )

  // ── 场次 ──────────────────────────────────────────────────────
  const generateSceneList = () =>
    runStep(
      "scenes",
      async () => generateScenes(await ensureProject(idea.trim().slice(0, 20)), idea.trim(), characters, episodes, genre.id),
      (data) => setScenes(data.scenes),
    )

  // ── 分镜（SSE 流式，复用现有 postSse）─────────────────────────
  const generateShotList = () => {
    const epoch = resetEpoch.current
    setStatus((st) => ({ ...st, shots: "streaming" }))
    setErrors((e) => ({ ...e, shots: null }))
    setShots([])

    const builtFrom = `${charactersSig}|${JSON.stringify(scenes)}`

    ;(async () => {
      try {
        const pid = await ensureProject(idea.trim().slice(0, 20))
        await postSse(
          "/api/shots",
          { projectId: pid, idea: idea.trim(), genre: genre.id, characters, scenes, visualCharacters: visuals, acts },
          (event, data) => {
            if (isCleared(epoch)) return
            const payload = data as { shots?: Shot[] }
            if ((event === "shots" || event === "done") && payload.shots) {
              setShots(payload.shots.map((s) => applyLocalRefs(s, visuals, attached)))
            }
          },
        )
        if (isCleared(epoch)) return
        setQuotaRefreshKey((n) => n + 1)
        setShotsBuiltFrom(builtFrom)
        setStatus((st) => ({ ...st, shots: "done" }))
      } catch (error) {
        if (isCleared(epoch)) return
        const message = error instanceof Error ? error.message : "生成失败，请重试"
        setErrors((e) => ({ ...e, shots: message }))
        setStatus((st) => ({ ...st, shots: "error" }))
      }
    })()
  }

  // ── 打包带走（P2）─────────────────────────────────────────────
  const handleExportPackage = async () => {
    const enc = new TextEncoder()
    const entries: { name: string; data: Uint8Array }[] = []
    const title = idea.trim().slice(0, 20) || "未命名漫剧"

    const manifest = {
      project: { id: projectId, title },
      exportedAt: Date.now(),
      story: { idea, characters, acts, episodes },
      assets: { visuals, scenes, shots },
      refs: Object.entries(attached).flatMap(([name, keys]) =>
        keys.map((k) => ({ ownerType: "character", ownerId: name, vaultKey: k }))),
    }

    entries.push({ name: "project.json", data: enc.encode(JSON.stringify(manifest, null, 2)) })
    entries.push({ name: "prompts.csv", data: enc.encode(shotsToCsv(shots)) })
    // 平台没有导入接口，所以除了 CSV 再给一份人类可读的执行清单
    entries.push({
      name: "shotlist.txt",
      data: enc.encode(shotsToWorkList(shots, `${title} · 分镜执行清单`)),
    })
    entries.push({ name: "storyboard.html", data: enc.encode(buildStoryboardHtml({ title, visuals, scenes, shots })) })
    entries.push({
      name: "README.txt",
      data: enc.encode([
        "成剧 · 项目包",
        "",
        "project.json      全部文本资产 + 角色视觉锚点 + 分镜",
        "prompts.csv       逐镜提示词（表格格式，含画面比例）",
        "shotlist.txt      逐镜执行清单（提示词 + 该带的参考图 + 参数），照着做即可",
        "storyboard.html   离线可看的分镜表（双击用浏览器打开）",
        "characters/       角色参考图（若从本地图库成功并入）",
        "",
        "说明：图片始终保存在你自己的机器上，本工具不上传、不托管任何图片。",
      ].join("\n")),
    })

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

    downloadBlob(`${title}-成剧项目包.zip`, buildZip(entries))
  }

  const handleCopyAll = async () => {
    const done = await copyText(markdown())
    setCopied(done)
    // 清掉上一个计时器，否则连点两次会提前把「已复制」收回去
    if (copyTimer.current) clearTimeout(copyTimer.current)
    if (done) copyTimer.current = setTimeout(() => setCopied(false), 2000)
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
    setStatus(IDLE_STATUS)
    setErrors(IDLE_ERRORS)
    setActsBuiltFrom(null)
    setEpisodesBuiltFrom(null)
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
      <header className="mx-auto w-full max-w-6xl px-4 pt-7 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-accent-600/25 pb-3.5">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="font-serif text-2xl font-bold leading-none text-accent-700 sm:text-3xl">
              成剧
            </h1>
            <span className="ai-badge" title="全流程 AI 生成">AI</span>
            <p className="mt-0.5 hidden min-w-0 truncate text-xs text-ink-500 lg:block">
              一句话成剧 · 从一句想法到大纲、分镜与出图提示词
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            {/* 三条硬指标：产品最该被记住的三件事 */}
            <ul className="hidden flex-wrap items-center gap-1.5 sm:flex">
              {['零部署', '图不上传', '一键打包带走'].map((tag) => (
                <li
                  key={tag}
                  className="rounded-pill bg-surface-soft px-2.5 py-1 text-[11px] font-medium text-ink-600"
                >
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
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 fill-current">
                <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.03a9.4 9.4 0 0 1 5 0c1.91-1.3 2.75-1.03 2.75-1.03.55 1.38.2 2.4.1 2.65.64.7 1.03 1.6 1.03 2.69 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" />
              </svg>
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start lg:gap-8">
          {/* 左：输入区（桌面端吸附） */}
          <div className="min-w-0 lg:sticky lg:top-8">
            <IdeaPanel
              idea={idea}
              onIdeaChange={setIdea}
              genre={genre}
              onGenreChange={setGenre}
              onGenerate={generateCharacters}
              onReset={handleReset}
              loading={status.characters === 'loading'}
              hasResult={hasResult}
              quotaRefreshKey={quotaRefreshKey}
            />
          </div>

          {/* 右：步骤条 + 三步内容 */}
          <div className="min-w-0 space-y-5">
            <div className="surface px-4 py-3.5">
              <StepIndicator
                current={currentStep}
                onJump={jumpToStep}
                completed={{
                  characters: hasCharacters,
                  acts: hasActs,
                  episodes: hasEpisodes,
                  visuals: visuals.length > 0,
                  scenes: scenes.length > 0,
                  shots: shots.length > 0,
                }}
              />
            </div>

            {/* 第一步：人物 */}
            <StepSection
              index={1}
              anchorId={STEP_ANCHORS.characters}
              title={STEPS[0].title}
              subtitle={STEPS[0].subtitle}
              status={status.characters}
              error={errors.characters}
              hasContent={hasCharacters}
              // 第一步没有前置步骤，它的「前置条件」是还没输入想法。
              // 不锁的话这里的按钮会一直亮着，而左侧那个同样功能的按钮是灰的。
              locked={idea.trim().length < MIN_IDEA_LENGTH}
              lockedHint="在左侧输入故事想法，然后点「生成人物」"
              actionLabel="生成人物"
              onGenerate={generateCharacters}
              skeletonVariant="characters"
              extraAction={
                characters.length < 5 ? (
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
                ) : null
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
              index={2}
              anchorId={STEP_ANCHORS.acts}
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
            >
              {actsStale && staleNotice('人物设定已改动，当前三幕大纲是基于旧人物生成的，建议重新生成一次。')}
              <ActList acts={acts} onChange={setActs} />
            </StepSection>

            {/* 第三步：分集剧情 */}
            <StepSection
              index={3}
              anchorId={STEP_ANCHORS.episodes}
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
            >
              {episodesStale && staleNotice('上游内容已改动，当前分集是基于旧版本生成的，建议重新生成一次。')}
              <EpisodeList episodes={episodes} onChange={setEpisodes} />
            </StepSection>

            {/* 第四步：角色视觉定妆（资产层） */}
            <StepSection
              index={4}
              anchorId={STEP_ANCHORS.visuals}
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
              {visuals.length > 0 && (
                <VersionBar
                  stale={visualsBuiltFrom !== charactersSig}
                  staleReason={
                    visualsBuiltFrom !== charactersSig ? "人物设定已改动" : null
                  }
                  affectedShots={impact?.affected ?? 0}
                  expiredShots={impact?.expired ?? 0}
                  onRebuild={() => { generateVisualAnchors(); void refreshImpact() }}
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
              />
            </StepSection>

            {/* 第五步：场次 */}
            <StepSection
              index={5}
              anchorId={STEP_ANCHORS.scenes}
              title={STEPS[4].title}
              subtitle={STEPS[4].subtitle}
              status={status.scenes}
              error={errors.scenes}
              hasContent={scenes.length > 0}
              locked={!hasEpisodes}
              lockedHint="请先生成分集剧情，再拆场次"
              actionLabel="场次"
              onGenerate={generateSceneList}
              skeletonVariant="acts"
            >
              <SceneList scenes={scenes} onChange={setScenes} />
            </StepSection>

            {/* 第六步：分镜（流式） */}
            <StepSection
              index={6}
              anchorId={STEP_ANCHORS.shots}
              title={STEPS[5].title}
              subtitle={STEPS[5].subtitle}
              status={status.shots}
              error={errors.shots}
              hasContent={shots.length > 0}
              locked={!hasActs || scenes.length === 0}
              lockedHint="请先生成三幕大纲与场次，再拆镜头"
              actionLabel="分镜"
              onGenerate={generateShotList}
              skeletonVariant="episodes"
            >
              {shots.length > 0 && (
                <VersionBar
                  stale={shotsBuiltFrom !== `${charactersSig}|${JSON.stringify(scenes)}`}
                  staleReason={
                    shotsBuiltFrom !== `${charactersSig}|${JSON.stringify(scenes)}`
                      ? "上游内容已改动"
                      : null
                  }
                  affectedShots={impact?.affected ?? 0}
                  expiredShots={impact?.expired ?? 0}
                  onRebuild={() => { generateShotList(); void refreshImpact() }}
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
                </div>
              )}
              <ShotList shots={shots} onChange={setShots} />
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

            {/* 本地图库（永远可见：用户需要知道图在哪儿） */}
            <VaultPanel
              mode={vaultMode}
              files={vaultFiles}
              onPickDirectory={handlePickDirectory}
              onReload={handleReloadVault}
              onAdd={(added) => setVaultFiles((prev) => [...prev, ...added])}
            />

            {/* 打包带走 */}
            {hasResult && (
              <div className="rounded-card border border-ink-200 bg-surface-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-ink-900">打包带走</p>
                    <p className="text-xs text-ink-500">
                      导出 project.json + prompts.csv + 离线分镜表（图不动、不上传）
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportPackage}
                    className="rounded-card bg-accent-700 px-4 py-2.5 text-sm font-medium text-white
                      transition-colors hover:bg-accent-800"
                  >
                    导出项目包
                  </button>
                </div>
              </div>
            )}

            {/* 底部导出 */}
            {hasResult && (
              <div className="flex flex-col gap-3 rounded-card border border-ink-200 bg-surface-card p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-ink-500">
                  已生成 {characters.length} 个角色 · {acts.length} 幕 · {episodes.length} 集
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAll}
                    className="flex-1 rounded-card bg-ink-900 px-4 py-2.5 text-sm font-medium text-white
                      transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-ink-400 sm:flex-none"
                  >
                    {copied ? '已复制 ✓' : '复制全部大纲'}
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    className="flex-1 rounded-card border border-ink-200 px-4 py-2.5 text-sm font-medium text-ink-700
                      transition-colors hover:border-ink-300 hover:bg-ink-50 focus-visible:outline-none
                      focus-visible:ring-2 focus-visible:ring-ink-300 sm:flex-none"
                  >
                    导出 .md
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
