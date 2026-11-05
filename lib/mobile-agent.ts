import { EMPTY_BRIEF } from './brief.ts'
import { runAgentLoop, type AgentMessage, type ModelReply } from './agent/loop.ts'
import {
  createToolExecutors,
  type AgentCard,
  type AgentDecision,
  type AgentEntityComment,
  type AgentState,
} from './agent/tools.ts'
import type { ArtifactKind } from './assets/types.ts'
import type { StepKey } from './types.ts'

export const MOBILE_AGENT_MAX_CALLS = 3

type SnapshotPayloads = Partial<Record<ArtifactKind, unknown>>

const AGENT_STEPS = new Set<StepKey>([
  'characters',
  'acts',
  'episodes',
  'visuals',
  'scenes',
  'shots',
])
const COMMENT_TARGETS = new Set<AgentEntityComment['targetType']>([
  'character',
  'place',
  'episode',
  'shot',
])

export interface MobileAgentQuota {
  remaining: number
  limit: number
  projectsLeft: number
}

export interface MobileAgentTurnResult {
  reply: string
  cards: AgentCard[]
  toolNames: string[]
  modelCalls: number
}

function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    : []
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown, fallback = 0): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export function readMobileAgentPrompt(value: unknown): string {
  const prompt = typeof value === 'string' ? value.trim() : ''
  if (prompt.length < 2) throw new Error('请先把问题说清楚')
  if (prompt.length > 300) throw new Error('问题太长了，请控制在 300 字以内')
  return prompt
}

export function buildMobileAgentState(input: {
  projectTitle: string
  snapshots: SnapshotPayloads
  quota: MobileAgentQuota
  videoReadiness?: AgentState["videoReadiness"]
  decisions?: unknown
  judgments?: unknown
  comments?: unknown
}): AgentState {
  const { projectTitle, snapshots, quota } = input
  const characters = readArray(snapshots.characters)
  const acts = readArray(snapshots.acts)
  const episodes = readArray(snapshots.episodes)
  const visuals = readArray(snapshots.visualCharacters)
  const scenes = readArray(snapshots.scenes)
  const places = readArray(snapshots.visualPlaces)
  const shots = readArray(snapshots.shots)
  const decisions: AgentDecision[] = readArray(input.decisions)
    .map((decision): AgentDecision | null => {
      const step = readText(decision.step) as StepKey
      const question = readText(decision.question)
      if (!AGENT_STEPS.has(step) || !question) return null
      return {
        id: readText(decision.id),
        step,
        question,
        chosenValue: readText(decision.chosenValue),
        reason: readText(decision.reason),
        status: readText(decision.status) || 'proposed',
        locked: decision.locked === true,
      }
    })
    .filter((decision): decision is AgentDecision => decision !== null)
    .slice(0, 20)
  const judgments = readArray(input.judgments)
    .map((judgment, index) => ({
      id: readText(judgment.id) || `mobile-judgment-${index}`,
      at: readNumber(judgment.createdAt) || readNumber(judgment.at),
      step: readText(judgment.step),
      action: readText(judgment.action),
      reason: readText(judgment.reason),
    }))
    .filter((judgment) => judgment.action)
    .slice(0, 10)
  const entityComments: AgentEntityComment[] = readArray(input.comments)
    .map((comment): AgentEntityComment | null => {
      const targetType = readText(comment.targetType) as AgentEntityComment['targetType']
      const targetId = readText(comment.targetId)
      const body = readText(comment.body)
      if (!COMMENT_TARGETS.has(targetType) || !targetId || !body) return null
      return {
        id: readText(comment.id),
        targetType,
        targetId,
        targetName: readText(comment.targetName) || targetId,
        body,
        status: readText(comment.status) === 'resolved' ? 'resolved' : 'open',
      }
    })
    .filter((comment): comment is AgentEntityComment => comment !== null)
    .slice(0, 20)

  return {
    projectTitle,
    hasIdea: !!snapshots.idea,
    brief: { ...EMPTY_BRIEF },
    judgments,
    decisions,
    canonIssues: [],
    entityComments,
    characters: characters.map((character) => ({
      name: readText(character.name),
      motivation: readText(character.motivation),
      arc: readText(character.arc),
    })),
    entities: [
      ...characters.map((character) => ({
        type: 'character' as const,
        id: readText(character.id),
        name: readText(character.name),
        fields: { personality: readText(character.personality) },
      })).filter((entity) => entity.id),
      ...places.map((place) => ({
        type: 'place' as const,
        id: readText(place.id),
        name: readText(place.name),
        fields: { space: readText(place.space) },
      })).filter((entity) => entity.id),
      ...episodes.map((episode) => ({
        type: 'episode' as const,
        id: readText(episode.id),
        name: `第 ${readNumber(episode.number)} 集 · ${readText(episode.title)}`,
        fields: { synopsis: readText(episode.synopsis) },
      })).filter((entity) => entity.id),
      ...shots.map((shot) => ({
        type: 'shot' as const,
        id: readText(shot.entityId) || readText(shot.id),
        name: `第 ${readNumber(shot.episode) || '?'} 集 · 第 ${readNumber(shot.shot)} 镜 · ${readText(shot.scene) || '未命名场景'}`,
        fields: { action: readText(shot.action) },
      })).filter((entity) => entity.id),
    ],
    episodes: episodes.map((episode) => ({
      number: readNumber(episode.number),
      title: readText(episode.title),
      synopsis: readText(episode.synopsis),
      hook: readText(episode.hook),
      intensity: Number.isFinite(Number(episode.intensity)) ? Number(episode.intensity) : undefined,
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
      targetId: readText(shot.entityId) || readText(shot.id),
      episode: readNumber(shot.episode),
      shot: readNumber(shot.shot),
      scene: readText(shot.scene),
      characters: readStringArray(shot.characters),
      missingRefFor: readStringArray(shot.missingRefFor),
      status: readText(shot.status),
      shotSize: readText(shot.shotSize),
      camera: readText(shot.camera),
      prompt: readText(shot.prompt),
      action: readText(shot.action),
      speaker: readText(shot.speaker),
      dialogue: readText(shot.dialogue),
    })),
    expiredShots: 0,
    videoReadiness: input.videoReadiness,
    quota,
    sourceMaterials: [],
  }
}

export async function runMobileAgentTurn(
  input: { prompt: string; state: AgentState },
  deps: {
    callModel: (messages: AgentMessage[]) => Promise<ModelReply>
    charge: () => void
  },
): Promise<MobileAgentTurnResult> {
  const toolNames: string[] = []
  const result = await runAgentLoop(input.prompt, {
    callModel: async (messages) => {
      deps.charge()
      return deps.callModel(messages)
    },
    executors: createToolExecutors(input.state),
    maxModelCalls: MOBILE_AGENT_MAX_CALLS,
    onEvent: (event) => {
      if (event.type === 'tool-call' && !toolNames.includes(event.name)) {
        toolNames.push(event.name)
      }
    },
  })

  const reply =
    [...result.messages].reverse().find((message) => message.role === 'assistant')?.content ||
    '这次没有拿到可用的回答，换个说法再试一次。'
  return {
    reply,
    cards: result.cards,
    toolNames,
    modelCalls: result.modelCalls,
  }
}
