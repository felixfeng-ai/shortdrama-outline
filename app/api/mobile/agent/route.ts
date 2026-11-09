import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'

import { InputError, errorResponse, ok } from '@/lib/api'
import { AGENT_SYSTEM_PROMPT } from '@/lib/agent/system'
import { AGENT_TOOL_SCHEMAS } from '@/lib/agent/tools'
import { toWireMessages } from '@/lib/agent/wire'
import { getDbForRequest } from '@/lib/assets/store'
import { ARTIFACT_KINDS, latestSnapshot, listProjects } from '@/lib/assets/repo'
import { listProjectDecisions, listProjectJudgments } from '@/lib/assets/decisions'
import { resolveProjectOwner, resolveRequestIdentity } from '@/lib/auth/request'
import { AiError, chatJson, chatWithTools } from '@/lib/deepseek'
import { listEntityComments } from '@/lib/entity-comments'
import {
  buildMobileAgentState,
  MOBILE_AGENT_MAX_CALLS,
  readMobileAgentPrompt,
  runMobileAgentTurn,
} from '@/lib/mobile-agent'
import { buildMobileVideoView } from '@/lib/mobile-video'
import { listGeneratedAssets, listGenerationTasks } from '@/lib/generation/repo'
import {
  getQuota,
  releaseQuota,
  reserveQuota,
  settleQuota,
} from '@/lib/quota'
import { projectQuotaEstimate, readEpisodeCount } from '@/lib/episodes'
import { getProjectContext } from '@/lib/assets/project-context'
import { enforceApiRateLimit } from '@/lib/security/api-rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    let prompt: string
    try {
      prompt = readMobileAgentPrompt(body?.prompt)
    } catch (error) {
      throw new InputError(error instanceof Error ? error.message : '问题不合法')
    }

    const db = getDbForRequest()
    const ownerId = resolveProjectOwner(db, req)
    const identity = resolveRequestIdentity(db, req)
    const requestedId = typeof body?.projectId === 'string' ? body.projectId.trim() : ''
    const project = requestedId
      ? listProjects(db, ownerId).find((item) => item.id === requestedId)
      : listProjects(db, ownerId)[0]
    if (!project) throw new InputError('项目不存在，或当前会话无权访问')

    const shotsSnapshot = latestSnapshot(db, project.id, 'shots')
    const snapshots = Object.fromEntries(
      ARTIFACT_KINDS.map((kind) => [
        kind,
        kind === 'shots'
          ? shotsSnapshot?.payload ?? null
          : latestSnapshot(db, project.id, kind)?.payload ?? null,
      ]),
    )
    const quota = getQuota(db, identity)
    const projectContext = getProjectContext(db, project.id)
    const estimate = projectQuotaEstimate(
      quota.remaining,
      readEpisodeCount(projectContext?.episodeCount),
    )
    const videoView = buildMobileVideoView({
      shots: snapshots.shots,
      assets: listGeneratedAssets(db, project.id),
      tasks: listGenerationTasks(db, project.id),
    })
    const state = buildMobileAgentState({
      projectTitle: project.title,
      snapshots,
      videoReadiness: videoView.readiness,
      decisions: listProjectDecisions(db, project.id, 20),
      judgments: listProjectJudgments(db, project.id, 20),
      comments: listEntityComments(db, project.id),
      quota: {
        remaining: quota.remaining,
        limit: quota.limit,
        projectsLeft: estimate.projectsLeft,
        episodeCount: estimate.episodeCount,
        projectCost: estimate.units,
        unlimited: quota.unlimited,
      },
    })

    let degraded = false
    const turnId = randomUUID()
    const holds: Array<{ id: string }> = []
    let result
    enforceApiRateLimit(db, req, 'assistant', { identity })
    try {
      result = await runMobileAgentTurn(
        { prompt, state },
        {
        charge: () => {
          const hold = reserveQuota(db, identity, 'agent', {
            requestId: `${turnId}:${holds.length + 1}`,
            groupId: turnId,
            groupLimit: MOBILE_AGENT_MAX_CALLS,
            units: 1,
          })
          holds.push(hold)
        },
        callModel: async (messages) => {
          const hold = holds[holds.length - 1]
          try {
            const reply = await chatWithTools(
              [
                { role: 'system', content: AGENT_SYSTEM_PROMPT },
                ...toWireMessages(messages),
              ],
              AGENT_TOOL_SCHEMAS,
              { temperature: 0.5 },
            )
            if (hold) settleQuota(db, hold.id, 1)
            return reply
          } catch (error) {
            if (!(error instanceof AiError)) throw error
            degraded = true
            const lastUser =
              [...messages].reverse().find((message) => message.role === 'user')?.content ?? prompt
            const raw = await chatJson<{ reply?: string; answer?: string }>(
              '你是「VeyaTV」里的 AI 场记。用中文直接回答，80 字以内，干脆具体，不要客套。',
              lastUser,
              { temperature: 0.5, maxTokens: 600 },
            )
            if (hold) settleQuota(db, hold.id, 1)
            return { reply: raw.reply ?? raw.answer ?? '这次没能回答，换个说法再试一次。' }
          }
        },
        },
      )
    } finally {
      for (const hold of holds) releaseQuota(db, hold.id, 'mobile_agent_unfinished')
    }

    return NextResponse.json(
      ok({
        ...result,
        degraded,
        turnId,
        turnLimit: MOBILE_AGENT_MAX_CALLS,
        projectId: project.id,
        baseShotsSnapshotId: shotsSnapshot?.id ?? null,
      }),
    )
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}
