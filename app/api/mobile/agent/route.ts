import { NextResponse } from 'next/server'

import { InputError, errorResponse, ok } from '@/lib/api'
import { AGENT_SYSTEM_PROMPT } from '@/lib/agent/system'
import { AGENT_TOOL_SCHEMAS } from '@/lib/agent/tools'
import { toWireMessages } from '@/lib/agent/wire'
import { getDbForRequest } from '@/lib/assets/store'
import { ARTIFACT_KINDS, latestSnapshot, listProjects } from '@/lib/assets/repo'
import { resolveProjectOwner, resolveRequestIdentity } from '@/lib/auth/request'
import { AiError, chatJson, chatWithTools } from '@/lib/deepseek'
import {
  buildMobileAgentState,
  readMobileAgentPrompt,
  runMobileAgentTurn,
} from '@/lib/mobile-agent'
import { FULL_PROJECT_COST, chargeQuota, getQuota } from '@/lib/quota'
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
    const state = buildMobileAgentState({
      projectTitle: project.title,
      snapshots,
      quota: {
        remaining: quota.remaining,
        limit: quota.limit,
        projectsLeft: Math.floor(quota.remaining / FULL_PROJECT_COST),
      },
    })

    let degraded = false
    const result = await runMobileAgentTurn(
      { prompt, state },
      {
        charge: () => {
          enforceApiRateLimit(db, req, 'assistant', { identity })
          chargeQuota(db, identity, 'agent')
        },
        callModel: async (messages) => {
          try {
            return await chatWithTools(
              [
                { role: 'system', content: AGENT_SYSTEM_PROMPT },
                ...toWireMessages(messages),
              ],
              AGENT_TOOL_SCHEMAS,
              { temperature: 0.5 },
            )
          } catch (error) {
            if (!(error instanceof AiError)) throw error
            degraded = true
            const lastUser =
              [...messages].reverse().find((message) => message.role === 'user')?.content ?? prompt
            const raw = await chatJson<{ reply?: string; answer?: string }>(
              '你是「成剧」里的 AI 场记。用中文直接回答，80 字以内，干脆具体，不要客套。',
              lastUser,
              { temperature: 0.5, maxTokens: 600 },
            )
            return { reply: raw.reply ?? raw.answer ?? '这次没能回答，换个说法再试一次。' }
          }
        },
      },
    )

    return NextResponse.json(
      ok({
        ...result,
        degraded,
        projectId: project.id,
        baseShotsSnapshotId: shotsSnapshot?.id ?? null,
      }),
    )
  } catch (error) {
    const { body, status, headers } = errorResponse(error)
    return NextResponse.json(body, { status, headers })
  }
}
