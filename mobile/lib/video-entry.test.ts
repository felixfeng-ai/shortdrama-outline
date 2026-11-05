import assert from 'node:assert/strict';
import test from 'node:test';

import {
  estimatePublicVideoCostMicros,
  generateWorkspaceVideo,
  videoModelCapability,
  type WorkspaceVideoCapabilities,
} from './video-entry.ts';

const capabilities: WorkspaceVideoCapabilities = {
  enabled: true,
  defaultModel: 'MiniMax-H3-Lite',
  defaultResolution: '768P',
  models: [{
    id: 'MiniMax-H3-Lite',
    minDuration: 4,
    maxDuration: 15,
    resolutions: ['768P'],
    pricesPerSecond: { '768P': 0.26 },
  }],
}

test('App 按公开视频能力计算费用，不读取供应商密钥', () => {
  assert.equal(videoModelCapability(capabilities, 'MiniMax-H3-Lite')?.maxDuration, 15)
  assert.equal(
    estimatePublicVideoCostMicros(capabilities, 'MiniMax-H3-Lite', '768P', 5),
    1_300_000,
  )
  assert.throws(
    () => estimatePublicVideoCostMicros(capabilities, 'missing', '768P', 5),
    /模型/,
  )
})

test('App 视频生成提交幂等键和预算，并返回真实任务', async () => {
  let url = ''
  let body: Record<string, unknown> | undefined
  let init: RequestInit | undefined
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input)
    init = options
    body = JSON.parse(String(options?.body)) as Record<string, unknown>
    return Response.json({
      success: true,
      error: null,
      data: {
        task: { id: 'video-task-1', status: 'queued', mediaKind: 'video' },
        asset: null,
      },
    })
  }
  const result = await generateWorkspaceVideo('http://127.0.0.1:3200', {
    projectId: 'p1',
    targetId: 'shot-1',
    sourceAssetId: 'frame-1',
    prompt: 'turn around',
    model: 'MiniMax-H3-Lite',
    resolution: '768P',
    duration: 5,
    ratio: '9:16',
    maxBudgetMicros: 1_300_000,
    idempotencyKey: 'video-key',
  }, fakeFetch as typeof fetch)

  assert.equal(url, 'http://127.0.0.1:3200/api/video/generations')
  assert.equal(init?.method, 'POST')
  assert.equal(body?.mode, 'image-to-video')
  assert.equal(body?.autoSelect, false)
  assert.equal(body?.idempotencyKey, 'video-key')
  assert.equal(result.task.id, 'video-task-1')
})
