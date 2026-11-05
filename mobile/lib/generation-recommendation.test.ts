import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendedGenerationTarget } from './generation-recommendation.ts';

test('推荐目标优先选择可用且没有运行任务的项目', () => {
  const items = [
    { id: 'blocked', blockedReason: '先采用首帧', latestTaskStatus: null },
    { id: 'running', blockedReason: null, latestTaskStatus: 'running' as const },
    { id: 'ready', blockedReason: null, latestTaskStatus: 'failed' as const },
  ]
  assert.equal(recommendedGenerationTarget(items)?.id, 'ready')
})

test('全部不可用时仍返回第一个目标，让用户看到阻断原因', () => {
  const items = [
    { id: 'blocked', blockedReason: '先采用首帧', latestTaskStatus: null },
  ]
  assert.equal(recommendedGenerationTarget(items)?.id, 'blocked')
})
