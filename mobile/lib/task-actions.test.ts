import assert from 'node:assert/strict';
import test from 'node:test';

import { cancelWorkspaceTask, retryWorkspaceTask } from './task-actions.ts';

test('取消与重试任务调用统一生成接口', async () => {
  const calls: Array<{ body: unknown; init?: RequestInit }> = [];
  const fakeFetch = async (_input: string | URL | Request, init?: RequestInit) => {
    calls.push({ body: JSON.parse(String(init?.body)), init });
    return Response.json({
      success: true,
      error: null,
      data: { task: { id: init?.body?.toString().includes('cancel') ? 'task-old' : 'task-new' } },
    });
  };
  await cancelWorkspaceTask('http://127.0.0.1:3200', 'p1', 'task-old', fakeFetch as typeof fetch);
  await retryWorkspaceTask('http://127.0.0.1:3200', 'p1', 'task-old', fakeFetch as typeof fetch);
  assert.deepEqual(calls[0].body, { action: 'cancel', projectId: 'p1', taskId: 'task-old' });
  assert.deepEqual(calls[1].body, { action: 'retry', projectId: 'p1', taskId: 'task-old' });
  assert.equal(calls[0].init?.method, 'PATCH');
});

test('视频任务取消与重试走视频任务接口', async () => {
  const urls: string[] = []
  const fakeFetch = async (input: string | URL | Request) => {
    urls.push(String(input))
    return Response.json({
      success: true,
      error: null,
      data: { task: { id: 'task-video', status: 'canceled' } },
    })
  }

  await cancelWorkspaceTask(
    'http://127.0.0.1:3200',
    'p1',
    'task-video',
    fakeFetch as typeof fetch,
    'video',
  )
  await retryWorkspaceTask(
    'http://127.0.0.1:3200',
    'p1',
    'task-video',
    fakeFetch as typeof fetch,
    'video',
  )

  assert.deepEqual(urls, [
    'http://127.0.0.1:3200/api/video/generations',
    'http://127.0.0.1:3200/api/video/generations',
  ])
})
