import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkspaceTask } from './workspace-api.ts';
import {
  filterWorkspaceTasks,
  hasActiveTasks,
  safeTaskError,
  taskCounts,
  taskCreatedLabel,
  taskDurationLabel,
  taskStatusLabel,
} from './task-view.ts';

const now = Date.UTC(2026, 10, 4, 8, 0, 0);

function task(patch: Partial<WorkspaceTask>): WorkspaceTask {
  return {
    id: 'task-1',
    targetType: 'shot',
    targetId: 'shot-1',
    targetLabel: '第 2 集 · 第 3 镜 · 天台',
    status: 'queued',
    error: null,
    assetId: null,
    createdAt: now - 65_000,
    startedAt: null,
    finishedAt: null,
    ...patch,
  };
}

test('真实任务按状态筛选和计数', () => {
  const tasks = [
    task({ id: 'queued', status: 'queued' }),
    task({ id: 'running', status: 'running' }),
    task({ id: 'succeeded', status: 'succeeded' }),
    task({ id: 'failed', status: 'failed', error: 'Provider 超时' }),
    task({ id: 'canceled', status: 'canceled' }),
  ];

  assert.deepEqual(taskCounts(tasks), {
    total: 5,
    active: 2,
    done: 1,
    failed: 2,
  });
  assert.deepEqual(filterWorkspaceTasks(tasks, 'active').map((item) => item.id), [
    'queued',
    'running',
  ]);
  assert.deepEqual(filterWorkspaceTasks(tasks, 'done').map((item) => item.id), ['succeeded']);
  assert.deepEqual(filterWorkspaceTasks(tasks, 'failed').map((item) => item.id), [
    'failed',
    'canceled',
  ]);
  assert.equal(hasActiveTasks(tasks), true);
});

test('任务状态、创建时间和耗时使用真实数据且不伪造', () => {
  assert.equal(taskStatusLabel('queued'), '等待中');
  assert.equal(taskStatusLabel('running'), '生成中');
  assert.equal(taskStatusLabel('succeeded'), '已完成');
  assert.equal(taskStatusLabel('failed'), '失败');
  assert.equal(taskStatusLabel('canceled'), '已停止');

  assert.equal(taskCreatedLabel(now - 65_000, now), '1 分钟前');
  assert.equal(taskCreatedLabel(now - 3_600_000, now), '1 小时前');
  assert.equal(taskCreatedLabel(now - 86_400_000, now), '2026-11-03');

  const running = task({ status: 'running', startedAt: now - 21_000 });
  assert.equal(taskDurationLabel(running, now), '00:21');
  const done = task({
    status: 'succeeded',
    startedAt: now - 48_000,
    finishedAt: now,
  });
  assert.equal(taskDurationLabel(done, now), '00:48');
  assert.equal(taskDurationLabel(task({ status: 'queued' }), now), '--');
});

test('失败原因脱敏后才显示', () => {
  assert.equal(safeTaskError('Invalid API key: abc'), '平台服务异常，请稍后重试');
  assert.equal(safeTaskError('Provider 超时'), 'Provider 超时');
  assert.equal(safeTaskError(null), '');
});
