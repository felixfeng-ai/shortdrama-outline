'use client'

import { useEffect, useRef, useState } from 'react'
import AgentRichText from './AgentRichText'
import { postJson } from '@/lib/api'
import {
  fetchProjectCanon,
  fetchProjectContext,
  fetchProjectDecisions,
  fetchQuota,
  listSnapshots,
} from '@/lib/assets/api'
import { countShotsMissingAnchors } from '@/lib/assets/anchors'
import type { Scene, Shot, VisualCharacter, VisualPlace } from '@/lib/assets/types'
import { runAgentLoop, type AgentMessage, type LoopEvent, type ModelReply } from '@/lib/agent/loop'
import { createToolExecutors, type AgentCard, type AgentState } from '@/lib/agent/tools'
import type { Act, Character, Episode, StepKey } from '@/lib/types'
import type { SkillDefinition } from '@/lib/skills/catalog'
import type { ProjectMaterial } from '@/lib/assets/materials'
import { runContinuitySkill, runDeterministicSkill } from '@/lib/skills/client'
import type { ContinuityReport } from '@/lib/skills/continuity'
import type { DeterministicSkillReport } from '@/lib/skills/deterministic'
import ContinuityReportCard from './ContinuityReportCard'
import DeterministicSkillReportCard from './DeterministicSkillReportCard'

interface SeedPrompt {
  id: number
  text: string
  skill: SkillDefinition | null
}

interface Props {
  open: boolean
  onClose: () => void
  projectId: string | null
  projectTitle: string
  projectContextBlock?: string
  sourceMaterials: ProjectMaterial[]
  selectedSkill: SkillDefinition | null
  seedPrompt: SeedPrompt | null
  onConsumedSeed: () => void
}

type DrawerLine =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; text: string }
  | { id: string; role: 'note'; text: string }
  | { id: string; role: 'report'; report: ContinuityReport }
  | { id: string; role: 'skill-report'; report: DeterministicSkillReport }
  | { id: string; role: 'card'; card: AgentCard }

interface ProcessStep {
  id: string
  label: string
  detail: string
}

const EMPTY_BRIEF = { emotion: '', audience: '', references: '', redline: '' }

function blankState(projectTitle: string): AgentState {
  return {
    projectTitle,
    hasIdea: false,
    brief: EMPTY_BRIEF,
    judgments: [],
    decisions: [],
    canonIssues: [],
    episodes: [],
    completed: {
      characters: false,
      acts: false,
      episodes: false,
      visuals: false,
      scenes: false,
      shots: false,
    },
    shots: [],
    expiredShots: 0,
    quota: null,
    sourceMaterials: [],
  }
}

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function SkillAgentDrawer({
  open,
  onClose,
  projectId,
  projectTitle,
  projectContextBlock = '',
  sourceMaterials,
  selectedSkill,
  seedPrompt,
  onConsumedSeed,
}: Props) {
  const [state, setState] = useState<AgentState>(() => blankState(projectTitle))
  const [ready, setReady] = useState(!projectId)
  const [lines, setLines] = useState<DrawerLine[]>([])
  const [processSteps, setProcessSteps] = useState<ProcessStep[]>([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [degraded, setDegraded] = useState(false)
  const messageRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const drawerRef = useRef<HTMLElement | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const consumedSeed = useRef<number | null>(null)
  const historyRef = useRef<AgentMessage[]>([])
  const lastContextBlock = useRef('')

  useEffect(() => {
    setState(blankState(projectTitle))
    lastContextBlock.current = ''
    if (!projectId) {
      setReady(true)
      return
    }
    let active = true
    setReady(false)
    Promise.all([
      Promise.all(['idea', 'characters', 'acts', 'episodes', 'visualCharacters', 'scenes', 'visualPlaces', 'shots'].map(
        (kind) => listSnapshots<unknown>(projectId, kind).catch(() => []),
      )),
      fetchQuota().catch(() => null),
      fetchProjectContext(projectId).catch(() => null),
      fetchProjectDecisions(projectId).catch(() => ({ decisions: [], judgments: [] })),
      fetchProjectCanon(projectId).catch(() => ({ entities: [], facts: [], issues: [] })),
    ]).then(([snapshots, quota, context, decisionData, canon]) => {
      if (!active) return
      const latest = snapshots.map((list) => list[0]?.payload)
      const idea = latest[0] as { idea?: string } | undefined
      const characters = (Array.isArray(latest[1]) ? latest[1] : []) as Character[]
      const acts = (Array.isArray(latest[2]) ? latest[2] : []) as Act[]
      const episodes = (Array.isArray(latest[3]) ? latest[3] : []) as Episode[]
      const visuals = (Array.isArray(latest[4]) ? latest[4] : []) as VisualCharacter[]
      const scenes = (Array.isArray(latest[5]) ? latest[5] : []) as Scene[]
      const places = (Array.isArray(latest[6]) ? latest[6] : []) as VisualPlace[]
      const shots = (Array.isArray(latest[7]) ? latest[7] : []) as Shot[]
      setState({
        projectTitle,
        hasIdea: Boolean(idea?.idea?.trim()),
        brief: context?.brief ?? EMPTY_BRIEF,
        judgments: decisionData.judgments.map((entry) => ({
          id: entry.id,
          at: entry.createdAt,
          step: entry.step as StepKey,
          action: entry.action,
          reason: entry.reason,
        })),
        decisions: decisionData.decisions.map((entry) => ({
          id: entry.id,
          step: entry.step as StepKey,
          question: entry.question,
          chosenValue: entry.chosenValue,
          reason: entry.reason,
          status: entry.status,
          locked: entry.locked,
        })),
        canonIssues: canon.issues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          entityName: issue.entityName,
          field: issue.field,
          message: issue.message,
        })),
        episodes: episodes.map((episode) => ({
          number: episode.number,
          title: episode.title,
          hook: episode.hook,
          intensity: episode.intensity,
        })),
        completed: {
          characters: characters.length > 0,
          acts: acts.length > 0,
          episodes: episodes.length > 0,
          visuals: visuals.length > 0,
          scenes: scenes.length > 0,
          shots: shots.length > 0,
        },
        shots: shots.map((shot) => ({
          shot: shot.shot,
          scene: shot.scene,
          characters: shot.characters,
          missingRefFor: shot.missingRefFor,
          status: shot.status,
          shotSize: shot.shotSize,
          camera: shot.camera,
          prompt: shot.prompt,
          speaker: shot.speaker,
          dialogue: shot.dialogue,
        })),
        expiredShots: countShotsMissingAnchors(shots, visuals),
        sourceMaterials: sourceMaterials.map((material) => ({
          id: material.id,
          name: material.name,
          kind: material.kind,
          characterCount: material.characterCount,
          chunkCount: material.chunkCount,
          content: material.content,
        })),
        quota: quota
          ? {
            remaining: quota.remaining,
            limit: quota.limit,
            projectsLeft: quota.projectsLeft,
          }
          : null,
      })
      setReady(true)
    }).catch(() => {
      if (active) {
        setState(blankState(projectTitle))
        setReady(true)
      }
    })
    return () => {
      active = false
    }
  }, [projectId, projectTitle, sourceMaterials])

  useEffect(() => {
    if (!open || !ready || !seedPrompt || consumedSeed.current === seedPrompt.id) return
    consumedSeed.current = seedPrompt.id
    void send(seedPrompt.text, seedPrompt.skill)
    onConsumedSeed()
  }, [open, ready, seedPrompt, onConsumedSeed])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 230)
  }, [open])

  useEffect(() => {
    if (!open) return
    previousFocus.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key === 'Tab') {
        const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (!focusable || focusable.length === 0) {
          event.preventDefault()
          return
        }
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && (document.activeElement === first || !drawerRef.current?.contains(document.activeElement))) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
      previousFocus.current?.focus()
    }
  }, [open, onClose])

  function scrollToEnd() {
    requestAnimationFrame(() => {
      messageRef.current?.scrollTo({ top: messageRef.current.scrollHeight, behavior: 'smooth' })
    })
  }

  async function send(textOverride?: string, skillOverride?: SkillDefinition | null) {
    const text = (textOverride ?? input).trim()
    if (!text || busy) return
    setBusy(true)
    setInput('')
    setProcessSteps([])
    setLines((current) => [...current, { id: uniqueId('user'), role: 'user', text }])
    const skill = skillOverride ?? selectedSkill
    const contextToSend = projectContextBlock && projectContextBlock !== lastContextBlock.current
      ? projectContextBlock
      : ''
    if (contextToSend) lastContextBlock.current = projectContextBlock
    const request = [
      skill ? `[使用 Skill：${skill.title}]\n${text}` : text,
      contextToSend,
    ].filter(Boolean).join('\n\n')
    const steps: ProcessStep[] = []
    const updateSteps = (next: ProcessStep[]) => {
      setProcessSteps([...next])
      scrollToEnd()
    }
    try {
      if ((skill?.id === 'delivery' || skill?.id === 'cost') && projectId) {
        updateSteps([{
          id: uniqueId('skill'),
          label: `确定性计算 · ${skill.title}`,
          detail: '',
        }])
        try {
          const report = await runDeterministicSkill(projectId, skill.id)
          updateSteps([{
            id: uniqueId('skill'),
            label: `确定性计算完成 · ${report.metrics[0]?.value ?? ''}`,
            detail: '0 模型调用，0 写入',
          }])
          setLines((current) => [
            ...current,
            { id: uniqueId('skill-report'), role: 'skill-report', report },
          ])
          historyRef.current = [
            ...historyRef.current,
            { role: 'user', content: request },
            { role: 'assistant', content: `${report.title}完成：${report.summary}只读，不写项目，不扣额度。` },
          ]
          return
        } catch {
          updateSteps([{
            id: uniqueId('skill'),
            label: '确定性 Runner 暂不可用',
            detail: '已转交场记继续处理',
          }])
        }
      }

      if (skill?.id === 'continuity' && projectId) {
        updateSteps([{
          id: uniqueId('skill'),
          label: '确定性检查 · 读取最新分镜、视觉与生成图',
          detail: '',
        }])
        try {
          const report = await runContinuitySkill(projectId)
          updateSteps([{
            id: uniqueId('skill'),
            label: `确定性检查完成 · ${report.summary.totalShots} 镜`,
            detail: `${report.summary.issueShots} 镜待处理，0 写入`,
          }])
          setLines((current) => [
            ...current,
            { id: uniqueId('report'), role: 'report', report },
          ])
          historyRef.current = [
            ...historyRef.current,
            { role: 'user', content: request },
            {
              role: 'assistant',
              content: `镜头连续性检查完成：检查 ${report.summary.totalShots} 镜，${report.summary.issueShots} 镜待处理，${report.summary.issueCount} 个具体问题。只读，不写项目，不扣额度。`,
            },
          ]
          return
        } catch {
          updateSteps([{
            id: uniqueId('skill'),
            label: '确定性 Runner 暂不可用',
            detail: '已转交场记继续处理',
          }])
        }
      }

      const result = await runAgentLoop(request, {
        callModel: async (messages): Promise<ModelReply> => {
          const data = await postJson<{
            reply?: string
            toolCalls?: ModelReply['toolCalls']
            degraded?: boolean
          }>('/api/agent', { messages: [...historyRef.current, ...messages] })
          if (data.degraded) setDegraded(true)
          return { reply: data.reply, toolCalls: data.toolCalls }
        },
        executors: createToolExecutors(state),
        onEvent: (event: LoopEvent) => {
          if (event.type === 'tool-call') {
            steps.push({
              id: uniqueId('tool'),
              label: `读取 · ${event.name}`,
              detail: '',
            })
            updateSteps(steps)
          } else if (event.type === 'tool-result' && steps.length > 0) {
            steps[steps.length - 1] = {
              ...steps[steps.length - 1],
              detail: event.content.slice(0, 500),
            }
            updateSteps(steps)
          }
        },
      })
      historyRef.current = [...historyRef.current, ...result.messages]
      const finalText = result.messages[result.messages.length - 1]?.content ?? '场记没有返回内容'
      setLines((current) => [
        ...current,
        { id: uniqueId('assistant'), role: 'assistant', text: finalText },
        ...result.cards.map((card) => ({ id: uniqueId('card'), role: 'card' as const, card })),
      ])
    } catch (error) {
      setLines((current) => [
        ...current,
        {
          id: uniqueId('note'),
          role: 'note',
          text: error instanceof Error ? error.message : '场记暂时没有回应，请稍后重试',
        },
      ])
    } finally {
      setBusy(false)
      scrollToEnd()
    }
  }

  function openWorkspace(card: AgentCard) {
    const step = card.kind === 'decision' || card.kind === 'regenerate'
      ? card.step
      : card.kind === 'entity-edit'
        ? card.targetType === 'character'
          ? 'characters'
          : card.targetType === 'place'
            ? 'scenes'
            : card.targetType === 'episode'
              ? 'episodes'
              : 'shots'
        : 'shots'
    const params = new URLSearchParams({ step })
    if (projectId) params.set('project', projectId)
    window.location.href = `/?${params.toString()}`
  }

  function openShotsWorkspace() {
    const params = new URLSearchParams({ step: 'shots' })
    if (projectId) params.set('project', projectId)
    window.location.href = `/?${params.toString()}`
  }

  return (
    <>
      <div className={`agent-scrim ${open ? 'open' : ''}`} onClick={onClose} />
      <aside
        ref={drawerRef}
        className={`agent-drawer ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="AI 场记"
        aria-hidden={!open}
        tabIndex={-1}
      >
        <header className="agent-head">
          <span className="agent-avatar">记</span>
          <span className="agent-heading">
            <b>AI 场记</b>
            <span>{ready ? '已读取当前项目，写项目前一定问你' : '正在读取当前项目…'}</span>
          </span>
          <span className="agent-ready">{busy ? 'WORKING' : ready ? 'READY' : 'LOADING'}</span>
          <button className="agent-close" type="button" onClick={onClose} aria-label="关闭场记">
            <svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15" /></svg>
          </button>
        </header>
        <div className="agent-context">
          正在看 <b>{projectTitle || '当前项目'}</b> · {selectedSkill ? selectedSkill.title : '未指定 Skill'}
        </div>
        <div ref={messageRef} className="agent-messages">
          {lines.length === 0 && processSteps.length === 0 && (
            <div className="agent-welcome">
              <div className="agent-bubble">
                <b>你可以直接说要完成什么。</b><br />
                我会先匹配 Skill、读取项目，再给计划。没有确认不会改内容或花生图额度。
              </div>
              <div className="agent-suggestions">
                {[
                  '现在还有哪些要处理？',
                  '检查当前分镜的首尾帧和参考图版本。',
                  '按即梦交付规格检查当前项目。',
                ].map((prompt) => (
                  <button key={prompt} className="agent-suggestion" type="button" onClick={() => { void send(prompt) }}>
                    <span>{prompt}</span>
                    <svg viewBox="0 0 20 20"><path d="m7 4 6 6-6 6" /></svg>
                  </button>
                ))}
              </div>
            </div>
          )}
          {lines.map((line) => {
            if (line.role === 'user') return <div key={line.id} className="message-user">{line.text}</div>
            if (line.role === 'assistant') {
              return (
                <div key={line.id} className="assistant-message">
                  <AgentRichText text={line.text} />
                </div>
              )
            }
            if (line.role === 'note') return <div key={line.id} className="assistant-message">{line.text}</div>
            if (line.role === 'report') {
              return (
                <ContinuityReportCard
                  key={line.id}
                  report={line.report}
                  onOpenWorkspace={openShotsWorkspace}
                />
              )
            }
            if (line.role === 'skill-report') {
              return (
                <DeterministicSkillReportCard
                  key={line.id}
                  report={line.report}
                  onOpenWorkspace={openShotsWorkspace}
                />
              )
            }
            return (
              <div key={line.id} className="plan-card">
                <h3>
                  待确认 · {line.card.kind === 'shot-edit'
                    ? `第 ${line.card.shot} 镜`
                    : line.card.kind === 'entity-edit'
                      ? line.card.targetName
                      : line.card.stepLabel}
                </h3>
                <p>
                  {line.card.kind === 'shot-edit'
                    ? line.card.summary
                    : line.card.kind === 'entity-edit'
                      ? line.card.summary
                    : line.card.kind === 'regenerate'
                      ? line.card.reason
                      : line.card.question}
                </p>
                <div className="plan-actions">
                  <button className="confirm" type="button" onClick={() => openWorkspace(line.card)}>去工作台处理</button>
                  <button type="button" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>忽略</button>
                </div>
              </div>
            )
          })}
          {processSteps.length > 0 && (
            <div className="process-block">
              {processSteps.map((step, index) => (
                <div key={step.id} className="process-row">
                  <i>{index === processSteps.length - 1 ? '└' : '├'}</i>
                  <b>{step.label}</b>
                  <span>{step.detail ? '已读取' : '处理中'}</span>
                </div>
              ))}
            </div>
          )}
          {degraded && <div className="agent-bubble">本次模型不支持工具调用，只能基于对话上下文回答。</div>}
          {busy && <div className="agent-bubble">场记正在核对项目…</div>}
        </div>
        <form className="agent-compose" onSubmit={(event) => { event.preventDefault(); void send() }}>
          <label className="sr-only" htmlFor="skill-agent-input">向场记提问</label>
          <input
            ref={inputRef}
            id="skill-agent-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="问项目、挑 Skill，或直接交给场记…"
            disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()} aria-label="发送">
            <svg viewBox="0 0 20 20"><path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" /></svg>
          </button>
        </form>
        <p className="demo-caption">场记调用平台 Skill 与项目工具 · 写入操作需另行确认</p>
      </aside>
    </>
  )
}
