'use client'

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react'
import {
  agentStepLabel,
  buildAppAgentState,
  enrichWebProject,
  orderedShotsForSelection,
  shotPreview,
  shotStatusLabel,
  webProjectFromDto,
  type AppDemoProject,
  type AppDemoProjectDetails,
} from '@/lib/app-demo-data'
import { isAbortError, postJson } from '@/lib/api'
import { runAgentLoop, type AgentMessage, type ModelReply } from '@/lib/agent/loop'
import { createToolExecutors, type AgentCard } from '@/lib/agent/tools'
import { listProjects, listSnapshots } from '@/lib/assets/api'
import type { Scene, Shot } from '@/lib/assets/types'
import type { Episode } from '@/lib/types'
import styles from './DoubaoStyleAgentApp.module.css'

type Mode = 'chat' | 'work'
type Attachment = { id: number; kind: 'image' | 'script'; label: string }
type Message = {
  id: number
  role: 'user' | 'agent'
  text: string
  attachments?: Attachment[]
  process?: string[]
  cards?: AgentCard[]
}
type SpeechRecognitionResultLike = {
  0: { transcript: string }
  isFinal: boolean
}
type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<SpeechRecognitionResultLike>
}
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike
type VoiceWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}
type Decision = 'pending' | 'later'
const DEMO_PROJECTS: AppDemoProject[] = [
  {
    id: 'night-harbor',
    title: '夜港来信',
    initial: '夜',
    episode: 'EP03',
    episodeLabel: '第 3 集',
    scene: '码头夜谈',
    sceneCode: '03-04',
    question: '下一场，要留下什么余味？',
    quote: '“雨刷停在玻璃中央，像一句被切断的话。”',
    update: '第 3 集 · 42 个镜头',
    status: 'Agent 正在运行',
    storyState: '正在写',
    shot: '第 17 镜',
    stepCount: '23 个镜头',
    workTitle: '钩子校准',
    workLead: '先让观众看见沈砚收起信封，再听见林昭那句「你哥没死」。',
    decision: '把林昭的台词晚 8 秒落下',
    source: 'demo',
  },
  {
    id: 'mist',
    title: '雾中来客',
    initial: '雾',
    episode: 'EP07',
    episodeLabel: '第 7 集',
    scene: '山门初雪',
    sceneCode: '07-02',
    question: '真相出现前，先让谁撒一次谎？',
    quote: '“雪落在刀背上，像有人替山门按住呼吸。”',
    update: '第 7 集 · 36 个镜头',
    status: '昨天更新',
    storyState: '正在写',
    shot: '第 9 镜',
    stepCount: '19 个镜头',
    workTitle: '悬念校准',
    workLead: '先让守门人藏起那枚铜铃，再让阿雾听见山门外的脚步。',
    decision: '把铜铃入画提前 4 秒',
    source: 'demo',
  },
  {
    id: 'thirteen',
    title: '第十三次回拨',
    initial: '十',
    episode: 'EP12',
    episodeLabel: '第 12 集',
    scene: '终点之前',
    sceneCode: '12-08',
    question: '最后一次回拨，应该留下谁的声音？',
    quote: '“电话接通时，雨刚好停在第十二秒。”',
    update: '第 12 集 · 58 个镜头',
    status: '已完成 · 10 月 21 日',
    storyState: '已完成',
    shot: '第 41 镜',
    stepCount: '31 个镜头',
    workTitle: '终场校准',
    workLead: '让录音机先响，再让顾遥说出那个从未拨出的号码。',
    decision: '把录音机底噪保留到最后一句',
    source: 'demo',
  },
]

function Icon({
  name,
  size = 20,
}: {
  name: 'plus' | 'mic' | 'arrow' | 'project' | 'chevron' | 'close' | 'check' | 'image' | 'file' | 'stop'
  size?: number
}) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    mic: (
      <>
        <rect x="9" y="4" width="6" height="10" rx="3" />
        <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M9 20h6" />
      </>
    ),
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    project: (
      <>
        <path d="M4 7.5h6l1.8 2H20v8.5H4z" />
        <path d="M4 7.5v-2h6l1.8 2" />
      </>
    ),
    chevron: <path d="m9 6 6 6-6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12.5 4.2 4L19 7" />,
    image: (
      <>
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.3" />
        <path d="m5.5 17 4.2-4.2 3.1 3.1 2.2-2.2 3.5 3.3" />
      </>
    ),
    file: (
      <>
        <path d="M6 3.5h7l5 5V20H6z" />
        <path d="M13 3.5v5h5M9 13h6M9 16h4" />
      </>
    ),
    stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  }
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={name === 'stop' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function SceneFrame({ bare = false, meta = '03-04' }: { bare?: boolean; meta?: string }) {
  return (
    <span className={styles.sceneFrame} role="img" aria-label="夜港来信第 3 集，雨夜码头">
      <span className={styles.sceneSky} />
      <span className={styles.sceneSkylineA} />
      <span className={styles.sceneSkylineB} />
      <span className={styles.sceneWater} />
      <span className={styles.scenePier} />
      <span className={styles.sceneActorA} />
      <span className={styles.sceneActorB} />
      <span className={styles.sceneLamp} />
      <span className={styles.sceneRain} />
      {!bare && (
        <>
          <span className={styles.sceneMeta}>{meta}</span>
          <span className={styles.sceneTime}>00:42:18</span>
        </>
      )}
    </span>
  )
}

export default function DoubaoStyleAgentApp() {
  const [projects, setProjects] = useState<AppDemoProject[]>(DEMO_PROJECTS)
  const [projectDetails, setProjectDetails] = useState<Record<string, AppDemoProjectDetails>>({})
  const [selectedShotNumbers, setSelectedShotNumbers] = useState<Record<string, number>>({})
  const [mode, setMode] = useState<Mode>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [agentSteps, setAgentSteps] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [thinking, setThinking] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [attachmentOpen, setAttachmentOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('')
  const [activeProjectId, setActiveProjectId] = useState('night-harbor')
  const [webProjectCount, setWebProjectCount] = useState(0)
  const [webState, setWebState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [decision, setDecision] = useState<Decision>('pending')
  const [changeOpen, setChangeOpen] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const addButtonRef = useRef<HTMLButtonElement | null>(null)
  const attachmentMenuRef = useRef<HTMLDivElement | null>(null)
  const firstAttachmentRef = useRef<HTMLButtonElement | null>(null)
  const mainRef = useRef<HTMLElement | null>(null)
  const projectButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const accountButtonRef = useRef<HTMLButtonElement | null>(null)
  const accountDialogRef = useRef<HTMLElement | null>(null)
  const accountCloseRef = useRef<HTMLButtonElement | null>(null)
  const changeDetailsRef = useRef<HTMLDivElement | null>(null)
  const shotRailRef = useRef<HTMLDivElement | null>(null)
  const selectedShotRef = useRef<HTMLButtonElement | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const voiceNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const agentAbortRef = useRef<AbortController | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? DEMO_PROJECTS[0]
  const activeDetails = projectDetails[activeProject.id]
  const activeShots = activeDetails?.shots ?? []
  const selectedShotNumber = selectedShotNumbers[activeProject.id] ?? activeShots[0]?.shot
  const activeShot = activeShots.find((shot) => shot.shot === selectedShotNumber) ?? activeShots[0]
  const webProjects = projects.filter((project) => project.source === 'web')
  const demoProjects = projects.filter((project) => project.source === 'demo')
  const workbenchHref = activeProject.source === 'web'
    ? `/?app=agent&project=${encodeURIComponent(activeProject.id)}`
    : '/?app=agent'
  const episodeNumber = Number(activeProject.episode.replace('EP', ''))
  const episodeLabels = [episodeNumber - 2, episodeNumber - 1, episodeNumber, episodeNumber + 1]
    .map((number) => `EP${String(number).padStart(2, '0')}`)

  async function loadWebProjectDetails(projectId: string) {
    try {
      const [episodes, scenes, shots] = await Promise.all([
        listSnapshots<Episode[]>(projectId, 'episodes'),
        listSnapshots<Scene[]>(projectId, 'scenes'),
        listSnapshots<Shot[]>(projectId, 'shots'),
      ])
      const episodeData = episodes[0]?.payload ?? []
      const sceneData = scenes[0]?.payload ?? []
      const shotData = shots[0]?.payload ?? []
      setProjectDetails((current) => ({
        ...current,
        [projectId]: {
          episodes: episodeData,
          scenes: sceneData,
          shots: shotData,
        },
      }))
      setSelectedShotNumbers((current) => {
        const selected = current[projectId]
        if (selected != null && shotData.some((shot) => shot.shot === selected)) return current
        return { ...current, [projectId]: shotData[0]?.shot ?? 0 }
      })
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? enrichWebProject(
                project,
                episodeData,
                sceneData,
                shotData,
              )
            : project,
        ),
      )
    } catch {
      // 项目壳仍然可用；快照失败时保留空态，避免把已读取的项目列表清空。
    }
  }

  async function loadWebProjects() {
    setWebState('loading')
    try {
      const webProjectsFromApi = (await listProjects()).map((project) => webProjectFromDto(project))
      setWebProjectCount(webProjectsFromApi.length)
      setProjects([...webProjectsFromApi, ...DEMO_PROJECTS])
      setWebState('ready')
      const first = webProjectsFromApi[0]
      if (!first) {
        setActiveProjectId('night-harbor')
        return
      }
      setMode('chat')
      setMessages([])
      setInput('')
      setActiveProjectId(first.id)
      await loadWebProjectDetails(first.id)
    } catch {
      setWebState('error')
    }
  }

  useEffect(() => {
    void loadWebProjects()
    // 只在页面挂载时读取同源会话项目；重试由面板按钮显式触发。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => () => {
    agentAbortRef.current?.abort()
    if (voiceNoticeTimer.current) clearTimeout(voiceNoticeTimer.current)
    recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    const composer = inputRef.current
    if (!composer) return
    composer.style.height = '36px'
    composer.style.height = `${Math.min(composer.scrollHeight, 88)}px`
  }, [input])

  useEffect(() => {
    if (messages.length === 0 && !thinking) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
  }, [messages, thinking])

  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    if (mode === 'work' || messages.length === 0) {
      main.scrollTo({ top: 0, behavior: 'auto' })
      return
    }
    main.scrollTo({ top: main.scrollHeight, behavior: 'auto' })
  }, [mode, activeProjectId])

  useEffect(() => {
    if (!changeOpen) return
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const frame = requestAnimationFrame(() => {
      changeDetailsRef.current?.scrollIntoView({
        block: 'nearest',
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [changeOpen])

  useEffect(() => {
    if (mode !== 'work' || selectedShotNumber == null) return
    const frame = requestAnimationFrame(() => {
      const rail = shotRailRef.current
      const button = selectedShotRef.current
      if (!rail || !button) return
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      rail.scrollTo({
        left: Math.max(0, button.offsetLeft - (rail.clientWidth - button.clientWidth) / 2),
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [mode, activeProject.id, selectedShotNumber])

  useEffect(() => {
    if (!projectOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : projectButtonRef.current
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      previousFocus?.focus()
    }
  }, [projectOpen])

  useEffect(() => {
    if (!accountOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : accountButtonRef.current
    const frame = requestAnimationFrame(() => accountCloseRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      previousFocus?.focus()
    }
  }, [accountOpen])

  useEffect(() => {
    if (!attachmentOpen) return
    const frame = requestAnimationFrame(() => firstAttachmentRef.current?.focus())
    function closeOnOutsidePress(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Node)) return
      if (attachmentMenuRef.current?.contains(target) || addButtonRef.current?.contains(target)) return
      setAttachmentOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePress)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('pointerdown', closeOnOutsidePress)
    }
  }, [attachmentOpen])

  function stopThinking() {
    agentAbortRef.current?.abort()
    agentAbortRef.current = null
    setThinking(false)
    setAgentSteps([])
  }

  function showVoiceNotice(message: string) {
    setVoiceNotice(message)
    if (voiceNoticeTimer.current) clearTimeout(voiceNoticeTimer.current)
    voiceNoticeTimer.current = setTimeout(() => {
      setVoiceNotice('')
      voiceNoticeTimer.current = null
    }, 5000)
  }

  function stopVoice() {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setListening(false)
  }

  function handleVoiceToggle() {
    if (listening) {
      stopVoice()
      return
    }

    const voiceWindow = window as VoiceWindow
    const Recognition = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition
    if (!Recognition) {
      showVoiceNotice('当前浏览器不支持语音输入，请改用键盘输入。')
      return
    }

    try {
      const recognition = new Recognition()
      recognition.lang = 'zh-CN'
      recognition.interimResults = false
      recognition.continuous = false
      recognition.onresult = (event) => {
        const transcript = Array.from(
          { length: event.results.length },
          (_, index) => event.results[index]?.[0]?.transcript ?? '',
        ).join('').trim()
        if (!transcript) return
        setInput((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript)
      }
      recognition.onend = () => {
        recognitionRef.current = null
        setListening(false)
      }
      recognition.onerror = (event) => {
        recognitionRef.current = null
        setListening(false)
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          showVoiceNotice('麦克风权限未开启，请在浏览器设置中允许后重试。')
        } else if (event.error === 'no-speech') {
          showVoiceNotice('没有听到声音，请重试或改用键盘输入。')
        } else if (event.error === 'audio-capture') {
          showVoiceNotice('没有检测到麦克风，请检查设备后重试。')
        } else {
          showVoiceNotice('语音输入中断，请重试或改用键盘输入。')
        }
      }
      recognitionRef.current = recognition
      setVoiceNotice('')
      setListening(true)
      recognition.start()
    } catch {
      showVoiceNotice('语音输入无法启动，请重试或改用键盘输入。')
    }
  }

  function resetConversation() {
    stopThinking()
    stopVoice()
    setMode('chat')
    setMessages([])
    setInput('')
    setAttachments([])
    setAttachmentOpen(false)
    setVoiceNotice('')
    setDecision('pending')
    setChangeOpen(false)
    requestAnimationFrame(() => mainRef.current?.scrollTo({ top: 0, behavior: 'auto' }))
  }

  function switchProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId)
    setActiveProjectId(projectId)
    setProjectOpen(false)
    resetConversation()
    if (project?.source === 'web') void loadWebProjectDetails(projectId)
  }

  function selectShot(shotNumber: number) {
    const details = projectDetails[activeProject.id]
    if (!details) return
    setSelectedShotNumbers((current) => ({
      ...current,
      [activeProject.id]: shotNumber,
    }))
    setChangeOpen(false)
    setProjects((current) =>
      current.map((project) =>
        project.id === activeProject.id
          ? enrichWebProject(
              project,
              details.episodes,
              details.scenes,
              orderedShotsForSelection(details.shots, shotNumber),
            )
          : project,
      ),
    )
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setProjectOpen(false)
      return
    }
    if (event.key !== 'Tab') return

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function handleAccountKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setAccountOpen(false)
      return
    }
    if (event.key !== 'Tab') return

    const focusable = accountDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function addAttachment(kind: Attachment['kind'], label: string) {
    setAttachments((current) => {
      if (current.length >= 3 || current.some((item) => item.kind === kind && item.label === label)) {
        return current
      }
      return [...current, { id: Date.now(), kind, label }]
    })
    setAttachmentOpen(false)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  function removeAttachment(id: number) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id))
    requestAnimationFrame(() => addButtonRef.current?.focus())
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void sendMessage()
  }

  async function sendMessage() {
    const text = input.trim()
    const nextAttachments = attachments.map((attachment) => ({ ...attachment }))
    if ((!text && nextAttachments.length === 0) || thinking) return
    stopVoice()
    const history: AgentMessage[] = messages
      .filter((message) => message.role === 'user' || message.role === 'agent')
      .map((message) => ({
        role: message.role === 'agent' ? 'assistant' as const : 'user' as const,
        content: message.text,
      }))
      .filter((message) => message.content.trim().length > 0)
    const attachmentContext = nextAttachments.length
      ? `参考附件：${nextAttachments.map((attachment) => attachment.label).join('、')}`
      : ''
    const agentPrompt = [text || '请结合这些附件继续检查当前场次。', attachmentContext]
      .filter(Boolean)
      .join('\n')
    const controller = new AbortController()
    const processLabels: string[] = []
    agentAbortRef.current = controller
    setMode('chat')
    setMessages((current) => [
      ...current,
      {
        id: Date.now(),
        role: 'user',
        text,
        attachments: nextAttachments.length ? nextAttachments : undefined,
      },
    ])
    setInput('')
    setAttachments([])
    setAttachmentOpen(false)
    setThinking(true)
    setAgentSteps([])

    try {
      const state = buildAppAgentState(activeProject, activeDetails)
      const result = await runAgentLoop(agentPrompt, {
        callModel: async (loopMessages) => {
          const data = await postJson<ModelReply & { degraded?: boolean }>(
            '/api/agent',
            { messages: [...history, ...loopMessages] },
            controller.signal,
          )
          return {
            reply: data.reply,
            toolCalls: data.toolCalls,
          }
        },
        executors: createToolExecutors(state),
        onEvent: (event) => {
          if (event.type !== 'tool-call') return
          const label = agentStepLabel(event.name)
          if (!processLabels.includes(label)) {
            processLabels.push(label)
            setAgentSteps([...processLabels])
          }
        },
      })
      const reply = result.messages[result.messages.length - 1]?.content || '这次没有拿到可用的回答。'
      setMessages((current) => [
        ...current,
        {
          id: Date.now() + 1,
          role: 'agent',
          text: reply,
          process: processLabels,
          cards: result.cards,
        },
      ])
    } catch (error) {
      if (!isAbortError(error)) {
        const reason = error instanceof Error ? error.message : 'Agent 暂时没有回应'
        const conciseReason = reason.trim().replace(/[。！？!?]+$/, '')
        setMessages((current) => [
          ...current,
          {
            id: Date.now() + 1,
            role: 'agent',
            text: `这次没能回答。${conciseReason}。可以缩短问题后再试。`,
            process: processLabels,
          },
        ])
      }
    } finally {
      if (agentAbortRef.current === controller) agentAbortRef.current = null
      setThinking(false)
      setAgentSteps([])
    }
  }

  const hasAgentReply = messages.some((message) => message.role === 'agent')
  const selectedShotLabel = activeShot ? `第 ${activeShot.shot} 镜` : activeProject.shot
  const shotDecisionTitle = activeShot?.speaker
    ? `把${activeShot.speaker}的台词落到动作之后`
    : activeProject.decision
  const shotDecisionDescription = activeShot
    ? `${activeShot.shotSize} · ${activeShot.camera} · ${activeShot.params.duration} 秒。画面与镜头长度保持不变。`
    : '只调整台词起点，不改画面与镜头长度。'

  function renderProjectRow(project: AppDemoProject) {
    const current = project.id === activeProject.id
    return (
      <button
        key={project.id}
        type="button"
        className={current ? styles.projectActive : styles.projectItem}
        aria-current={current ? 'true' : undefined}
        onClick={() => {
          if (current) {
            setProjectOpen(false)
            return
          }
          switchProject(project.id)
        }}
      >
        {current ? (
          <span className={styles.projectThumb}><SceneFrame /></span>
        ) : (
          <span className={styles.projectInitial}>{project.initial}</span>
        )}
        <span>
          <b>{project.title}</b>
          <small>{project.update} · {project.status}</small>
        </span>
        {current && <Icon name="check" size={18} />}
      </button>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.phone}>
        <div className={styles.statusBar} aria-hidden="true">
          <span>9:41</span>
          <span className={styles.statusRight}><i /><i /><i /></span>
        </div>

        <header className={styles.header}>
          <button type="button" className={styles.logoButton} aria-label="返回聊天首页" onClick={resetConversation}>
            <span className={styles.logo}>V</span>
            <span className={styles.brandText}>
              <b>成剧</b>
              <small>STORY AGENT</small>
            </span>
          </button>
          <div className={styles.headerActions}>
            <button
              ref={projectButtonRef}
              type="button"
              className={styles.projectPill}
              aria-haspopup="dialog"
              aria-expanded={projectOpen}
              aria-controls="project-sheet"
              onClick={() => {
                setAccountOpen(false)
                setProjectOpen(true)
              }}
            >
              <span className={styles.projectPillName}>{activeProject.title}</span>
              <Icon name="chevron" size={13} />
            </button>
            <button
              ref={accountButtonRef}
              type="button"
              className={styles.accountPill}
              aria-haspopup="dialog"
              aria-expanded={accountOpen}
              aria-controls="account-sheet"
              onClick={() => {
                setProjectOpen(false)
                setAccountOpen(true)
              }}
            >
              <i aria-hidden="true" />
              本机
            </button>
          </div>
        </header>

        <main ref={mainRef} className={styles.main}>
          {mode === 'chat' && messages.length === 0 && (
            <section className={styles.hero}>
              <span className={styles.context}>{activeProject.title} · {activeProject.episode} · {activeProject.scene}</span>
              <h1>{activeProject.question}</h1>
              <div className={styles.storyLine} aria-label="故事进度">
                <span className={styles.storyDone}>{episodeLabels[0]}</span>
                <i className={styles.storyDone} />
                <span className={styles.storyDone}>{episodeLabels[1]}</span>
                <i className={styles.storyDone} />
                <span className={styles.storyCurrent}>{episodeLabels[2]}</span>
                <i />
                <span>{episodeLabels[3]}</span>
                <b>{activeProject.storyState}</b>
              </div>
              <button type="button" className={styles.creativePreview} onClick={() => setMode('work')}>
                <span className={styles.creativeMedia}>
                  <SceneFrame bare />
                  <span className={styles.creativeShade} />
                  <span className={styles.creativeIndex}>{activeProject.sceneCode}</span>
                  <span className={styles.creativeCopy}>
                    <small><i />正在成形的场面 · {activeProject.shot}</small>
                    <b>{activeProject.scene}</b>
                    <p>{activeProject.quote}</p>
                  </span>
                </span>
              </button>
              <div className={styles.segment} role="tablist" aria-label="对话模式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'chat'}
                  className={styles.segmentActive}
                  onClick={() => setMode('chat')}
                >
                  对话
                </button>
                <button type="button" role="tab" aria-selected={false} onClick={() => setMode('work')}>
                  创作
                </button>
              </div>
              <div className={styles.quietPrompts}>
                <button type="button" onClick={() => setInput(`把${activeProject.episodeLabel}的钩子再收紧一点`)}>
                  收紧{activeProject.episodeLabel}钩子
                </button>
                <button type="button" onClick={() => setInput('看看今天还差哪些待办')}>看看今天还差什么</button>
              </div>
            </section>
          )}

          {mode === 'chat' && messages.length > 0 && (
            <section className={styles.conversation}>
              <div className={styles.threadContext}>
                <span>{activeProject.title}</span>
                <small>{activeProject.update}</small>
              </div>
              {messages.map((message) => (
                <div key={message.id} className={message.role === 'user' ? styles.userTurn : styles.agentTurn}>
                  {message.role === 'agent' && <span className={styles.agentMark}>V</span>}
                  {message.role === 'agent' ? (
                    <div className={styles.agentResponse}>
                      {!!message.process?.length && (
                        <div className={styles.agentProcess} aria-label="Agent 已读取">
                          <span>已读</span>
                          {message.process.map((label) => <small key={label}>{label}</small>)}
                        </div>
                      )}
                      <p>{message.text}</p>
                      {message.cards?.map((card, index) => (
                        <div key={`${card.kind}-${index}`} className={styles.agentProposal}>
                          <span>待确认</span>
                          <b>
                            {card.kind === 'shot-edit'
                              ? `第 ${card.shot} 镜 · ${card.summary}`
                              : `重新生成 · ${card.stepLabel}`}
                          </b>
                          <p>{card.kind === 'shot-edit' ? card.text : card.reason}</p>
                          <a href={workbenchHref}>去工作台确认</a>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.userBubble}>
                      {message.text && <p>{message.text}</p>}
                      {!!message.attachments?.length && (
                        <div className={styles.userAttachments}>
                          {message.attachments.map((attachment) => (
                            <span key={attachment.id} className={styles.messageAttachment}>
                              <Icon name={attachment.kind === 'image' ? 'image' : 'file'} size={13} />
                              {attachment.label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {thinking && (
                <div className={styles.agentTurn} aria-live="polite">
                  <span className={styles.agentMark}>V</span>
                  <div className={styles.thinkingWrap}>
                    <div className={styles.thinking}><i /><i /><i /></div>
                    {agentSteps.length > 0 && (
                      <div className={styles.agentLiveSteps}>
                        {agentSteps.map((label) => <span key={label}>已读{label}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {!thinking && hasAgentReply && activeShot && (
                <button type="button" className={styles.agentArtifact} onClick={() => setMode('work')}>
                  <span className={styles.agentArtifactMedia}><SceneFrame bare /></span>
                  <span className={styles.agentArtifactCopy}>
                    <small>{activeProject.episodeLabel} · {activeProject.shot}</small>
                    <b>首帧草案已生成</b>
                    <p>{activeShot.shotSize} · {activeShot.camera} · {shotStatusLabel(activeShot.status)}</p>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              )}
              <div ref={endRef} />
            </section>
          )}

          {mode === 'work' && (
            <section className={styles.workView}>
              <div className={styles.workHeader}>
                <div>
                  <span>正在进行</span>
                  <h1>{activeProject.episodeLabel} · {activeProject.workTitle}</h1>
                </div>
                <span className={styles.runningBadge}><i />运行中</span>
              </div>
              <p className={styles.workLead}>{activeProject.workLead}</p>
              <div className={styles.steps}>
                <div className={styles.stepDone}><span><Icon name="check" size={13} /></span><b>读取{activeProject.episodeLabel}分镜</b><small>{activeProject.stepCount}</small></div>
                <div className={styles.stepActive}><span><i /></span><b>{activeShot?.speaker ? `检查${activeShot.speaker}的台词` : '检查画面调度'}</b><small>进行中</small></div>
                <div className={styles.stepWait}><span><i /></span><b>比对关键帧</b><small>等待</small></div>
              </div>
              <div className={styles.workArtifact}>
                <div className={styles.artifactHead}><span>当前产物</span><small>{selectedShotLabel} · 首帧</small></div>
                <SceneFrame meta={activeProject.sceneCode} />
              </div>
              <div className={styles.shotRailSection}>
                <div className={styles.shotRailHead}>
                  <span>镜头轨道</span>
                  <small>{activeShots.length ? `${activeShots.length} 镜 · 点选切换` : '当前项目'}</small>
                </div>
                {activeShots.length > 0 ? (
                  <div ref={shotRailRef} className={styles.shotRail} aria-label="镜头列表">
                    {activeShots.map((shot) => {
                      const selected = shot.shot === activeShot?.shot
                      return (
                        <button
                          key={shot.id}
                          ref={selected ? selectedShotRef : undefined}
                          type="button"
                          className={`${styles.shotRailItem} ${selected ? styles.shotRailItemActive : ''}`}
                          aria-pressed={selected}
                          aria-label={`第 ${shot.shot} 镜，${shotStatusLabel(shot.status)}，${shotPreview(shot)}`}
                          onClick={() => selectShot(shot.shot)}
                        >
                          <span className={styles.shotRailMeta}>
                            <b>第 {shot.shot} 镜</b>
                            <small>{shotStatusLabel(shot.status)}</small>
                          </span>
                          <strong>{shot.scene || '未标场景'}</strong>
                          <p>{shotPreview(shot)}</p>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className={styles.shotRailEmpty}>
                    <span>这个项目还没有分镜，可以先生成镜头再回来调度。</span>
                    <a href={workbenchHref}>去完整工作台</a>
                  </div>
                )}
              </div>
              <div className={styles.workDecision}>
                <span>需要你确认</span>
                <h2>{shotDecisionTitle}</h2>
                <p>{shotDecisionDescription}</p>
                <div className={styles.decisionActions}>
                  <button
                    type="button"
                    onClick={() => {
                      setDecision('later')
                      setChangeOpen(false)
                      setMode('chat')
                    }}
                  >
                    稍后决定
                  </button>
                  <button
                    type="button"
                    className={styles.darkButton}
                    aria-expanded={changeOpen}
                    aria-controls="change-details"
                    onClick={() => setChangeOpen((current) => !current)}
                  >
                    {changeOpen ? '收起细节' : activeShot ? '查看镜头细节' : '查看改动'}
                  </button>
                </div>
                {changeOpen && (
                  <div ref={changeDetailsRef} id="change-details" className={styles.changeDetails} aria-live="polite">
                    <span>{activeShot ? '镜头参数' : '台词起点'}</span>
                    <b>{activeShot ? `${activeShot.shotSize} · ${activeShot.camera}` : '00:08.4 → 00:16.4'}</b>
                    <small>
                      {activeShot
                        ? `${activeShot.params.duration} 秒 · ${activeShot.params.ratio} · ${shotStatusLabel(activeShot.status)}`
                        : '只更新当前草案，不覆盖原稿'}
                    </small>
                  </div>
                )}
                {decision === 'later' && <p className={styles.decisionNote}>已记下，回到对话继续。</p>}
              </div>
            </section>
          )}
        </main>

        <footer className={styles.footer}>
          {thinking && (
            <button type="button" className={styles.stopBar} onClick={stopThinking}>
              <span><i />正在思考</span>
              <span><Icon name="stop" size={13} />停止</span>
            </button>
          )}
          <form
            className={styles.composer}
            onSubmit={submit}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && attachmentOpen) {
                event.preventDefault()
                setAttachmentOpen(false)
                addButtonRef.current?.focus()
              }
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              aria-label="选择本机参考图"
              className={styles.hiddenInput}
              onChange={(event) => {
                const available = Math.max(0, 3 - attachments.length)
                const files = Array.from(event.target.files ?? []).slice(0, available)
                if (files.length) {
                  setAttachments((current) => [
                    ...current,
                    ...files.map((file, index) => ({
                      id: Date.now() + index,
                      kind: 'image' as const,
                      label: file.name,
                    })),
                  ])
                }
                event.target.value = ''
                setAttachmentOpen(false)
                requestAnimationFrame(() => inputRef.current?.focus())
              }}
            />
            {attachmentOpen && (
              <div
                ref={attachmentMenuRef}
                id="attachment-menu"
                className={styles.attachmentMenu}
                role="group"
                aria-label="添加附件"
              >
                <button
                  ref={firstAttachmentRef}
                  type="button"
                  disabled={attachments.length >= 3}
                  onClick={() => {
                    setAttachmentOpen(false)
                    fileInputRef.current?.click()
                  }}
                >
                  <span><Icon name="image" size={17} /></span>
                  <span><b>引用本机图片</b><small>只登记文件名，不读取内容</small></span>
                </button>
                <button
                  type="button"
                  disabled={attachments.length >= 3}
                  onClick={() => addAttachment('script', `${activeProject.episodeLabel} · ${activeProject.scene}剧本`)}
                >
                  <span><Icon name="file" size={17} /></span>
                  <span><b>引用当前场次</b><small>{activeProject.scene} · 对白与场面</small></span>
                </button>
              </div>
            )}
            <div className={styles.composerContext}>
              <span>{activeProject.title}</span>
              <i />
              <span>{activeProject.episodeLabel} · {activeProject.scene}</span>
            </div>
            {listening && (
              <div className={styles.voiceListening} role="status">
                <i aria-hidden="true" />
                正在听，请说话…
              </div>
            )}
            {voiceNotice && (
              <div className={styles.voiceNotice} role="status">
                <span>{voiceNotice}</span>
                <button type="button" aria-label="关闭语音提示" onClick={() => setVoiceNotice('')}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}
            {attachments.length > 0 && (
              <div className={styles.composerAttachments} aria-label="待发送附件">
                {attachments.map((attachment) => (
                  <button
                    key={attachment.id}
                    type="button"
                    className={styles.composerAttachment}
                    aria-label={`移除附件：${attachment.label}`}
                    onClick={() => removeAttachment(attachment.id)}
                  >
                    <Icon name={attachment.kind === 'image' ? 'image' : 'file'} size={13} />
                    <span>{attachment.label}</span>
                    <Icon name="close" size={12} />
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value)
                setVoiceNotice('')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={listening ? '正在听，请说话…' : '继续这场戏，或问我任何事…'}
              aria-label="给 Agent 发消息"
              enterKeyHint="send"
              rows={1}
            />
            <div className={styles.composerBottom}>
              <button
                ref={addButtonRef}
                type="button"
                className={styles.addButton}
                aria-label="添加附件"
                aria-expanded={attachmentOpen}
                aria-controls="attachment-menu"
                onClick={() => setAttachmentOpen((current) => !current)}
              >
                <Icon name="plus" size={21} />
              </button>
              <button type="button" className={styles.modeButton} onClick={() => setMode(mode === 'chat' ? 'work' : 'chat')}>
                <Icon name={mode === 'chat' ? 'project' : 'image'} size={18} />
                {mode === 'chat' ? '对话' : '创作'}
                <Icon name="chevron" size={12} />
              </button>
              <button
                type="button"
                className={`${styles.micButton} ${listening ? styles.micActive : ''}`}
                aria-label={listening ? '停止语音输入' : '语音输入'}
                aria-pressed={listening}
                onClick={handleVoiceToggle}
              >
                <Icon name={listening ? 'stop' : 'mic'} size={20} />
              </button>
              {(input.trim() || attachments.length > 0) && !thinking && (
                <button type="submit" className={styles.sendButton} aria-label="发送">
                  <Icon name="arrow" size={20} />
                </button>
              )}
            </div>
          </form>
        </footer>

        {projectOpen && (
          <div className={styles.sheetLayer}>
            <button type="button" className={styles.scrim} aria-label="关闭项目列表" onClick={() => setProjectOpen(false)} />
            <section
              ref={dialogRef}
              id="project-sheet"
              className={styles.sheet}
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-sheet-title"
              tabIndex={-1}
              onKeyDown={handleDialogKeyDown}
            >
              <div className={styles.handle} />
              <div className={styles.sheetHead}>
                <div><span>当前项目</span><h2 id="project-sheet-title">{activeProject.title}</h2></div>
                <button ref={closeButtonRef} type="button" className={styles.closeButton} onClick={() => setProjectOpen(false)} aria-label="关闭">
                  <Icon name="close" size={19} />
                </button>
              </div>
              <div className={styles.projectSectionHead}>
                <span>Web 项目</span>
                <small>{webState === 'loading' ? '连接中' : `${webProjectCount} 个`}</small>
              </div>
              {webState === 'loading' && (
                <div className={styles.projectEdgeState} role="status">
                  <span>正在读取当前浏览器的 Web 项目…</span>
                </div>
              )}
              {webState === 'error' && (
                <div className={styles.projectEdgeState}>
                  <span>暂时无法连接 Web 数据，示例仍可查看。</span>
                  <button type="button" onClick={() => void loadWebProjects()}>重试</button>
                </div>
              )}
              {webState === 'ready' && webProjects.length === 0 && (
                <div className={styles.projectEdgeState}>
                  <span>当前浏览器还没有 Web 项目。</span>
                  <a href="/?app=agent">去新建</a>
                </div>
              )}
              {webState === 'ready' && webProjects.map(renderProjectRow)}
              <div className={styles.projectSectionHead}>
                <span>界面示例</span>
                <small>不写入项目库</small>
              </div>
              {demoProjects.map(renderProjectRow)}
              <p className={styles.sheetFootnote}>
                真实项目与 Web 共用当前浏览器的本机会话。
              </p>
            </section>
          </div>
        )}

        {accountOpen && (
          <div className={styles.sheetLayer}>
            <button type="button" className={styles.scrim} aria-label="关闭本机会话说明" onClick={() => setAccountOpen(false)} />
            <section
              ref={accountDialogRef}
              id="account-sheet"
              className={styles.sheet}
              role="dialog"
              aria-modal="true"
              aria-labelledby="account-sheet-title"
              tabIndex={-1}
              onKeyDown={handleAccountKeyDown}
            >
              <div className={styles.handle} />
              <div className={styles.sheetHead}>
                <div><span>当前身份</span><h2 id="account-sheet-title">本机创作会话</h2></div>
                <button ref={accountCloseRef} type="button" className={styles.closeButton} onClick={() => setAccountOpen(false)} aria-label="关闭">
                  <Icon name="close" size={19} />
                </button>
              </div>
              <div className={styles.accountIdentity}>
                <span className={styles.accountAvatar} aria-hidden="true">匿</span>
                <div>
                  <b>匿名创作会话</b>
                  <p>打开即可创作，当前不要求注册。</p>
                </div>
                <span className={styles.localBadge}><i />本机</span>
              </div>
              <dl className={styles.accountFacts}>
                <div>
                  <dt>Web 数据</dt>
                  <dd>
                    {webState === 'loading'
                      ? '正在连接'
                      : webState === 'error'
                        ? '连接失败，可重试'
                        : `${webProjectCount} 个项目 · 同浏览器`}
                  </dd>
                </div>
                <div><dt>记录范围</dt><dd>项目与设置跟随当前浏览器</dd></div>
                <div><dt>图片边界</dt><dd>本地原图不随请求上传</dd></div>
                <div><dt>跨设备同步</dt><dd>后续版本提供</dd></div>
              </dl>
              <a className={styles.sheetPrimary} href={workbenchHref}>
                打开完整工作台
              </a>
              <button type="button" className={styles.sheetSecondary} onClick={() => setAccountOpen(false)}>
                关闭
              </button>
            </section>
          </div>
        )}
      </div>
      <p className={styles.demoNote}>Doubao-style Agent App · 界面样机</p>
    </div>
  )
}
