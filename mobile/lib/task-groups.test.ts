import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkspaceTask } from './workspace-api.ts';
import { groupWorkspaceTasks } from './task-groups.ts';

function task(patch: Partial<WorkspaceTask>): WorkspaceTask {
  return {
    id: 'task',
    targetType: 'shot',
    targetId: 'shot',
    targetLabel: '第 1 镜',
    status: 'succeeded',
    error: null,
    assetId: 'asset',
    createdAt: 1,
    startedAt: 2,
    finishedAt: 3,
    mediaKind: 'video',
    batchId: null,
    estimatedCostMicros: 1_000_000,
    actualCostMicros: 1_000_000,
    ...patch,
  };
}

test('同批次任务折叠，单镜任务保持独立', () => {
  const groups = groupWorkspaceTasks([
    task({ id: 'b1', batchId: 'batch-1', targetId: 's1' }),
    task({ id: 'b2', batchId: 'batch-1', targetId: 's2', status: 'running', assetId: null }),
    task({ id: 'single', batchId: null, targetId: 's3' }),
  ])

  assert.equal(groups.length, 2)
  assert.equal(groups[0].kind, 'batch')
  assert.equal(groups[0].tasks.length, 2)
  assert.equal(groups[0].reviewable, 1)
  assert.equal(groups[1].kind, 'single')
})

test('可审片任务只统计成功且有资产的终态任务', () => {
  const groups = groupWorkspaceTasks([
    task({ id: 'ok', assetId: 'a1' }),
    task({ id: 'no-asset', assetId: null }),
    task({ id: 'running', status: 'running', assetId: null }),
  ])
  assert.equal(groups.filter((group) => group.reviewable > 0).length, 1)
})
