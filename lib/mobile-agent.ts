import { EMPTY_BRIEF } from './brief.ts'
import { runAgentLoop, type AgentMessage, type ModelReply } from './agent/loop.ts'
import { createToolExecutors, type AgentCard, type AgentState } from './agent/tools.ts'
import type { ArtifactKind } from './assets/types.ts'

export const MOBILE_AGENT_MAX_CALLS = 3

type SnapshotPayloads = Partial<Record<ArtifactKind, unknown>>

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
}): AgentState {
  const { projectTitle, snapshots, quota } = input
  const characters = readArray(snapshots.characters)
  const acts = readArray(snapshots.acts)
  const episodes = readArray(snapshots.episodes)
  const visuals = readArray(snapshots.visualCharacters)
  const scenes = readArray(snapshots.scenes)
  const shots = readArray(snapshots.shots)

  return {
    projectTitle,
    hasIdea: !!snapshots.idea,
    brief: { ...EMPTY_BRIEF },
    judgments: [],
    episodes: episodes.map((episode) => ({
      number: readNumber(episode.number),
      title: readText(episode.title),
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
      shot: readNumber(shot.shot),
      scene: readText(shot.scene),
      characters: readStringArray(shot.characters),
      missingRefFor: readStringArray(shot.missingRefFor),
      status: readText(shot.status),
      shotSize: readText(shot.shotSize),
      camera: readText(shot.camera),
      prompt: readText(shot.prompt),
      speaker: readText(shot.speaker),
      dialogue: readText(shot.dialogue),
    })),
    expiredShots: 0,
    quota,
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
