import assert from 'node:assert/strict';
import test from 'node:test';

import { generateWorkspaceTarget } from './generation-entry.ts';

test('App 生成入口复用生成 API 并返回真实任务与资产', async () => {
  let body: Record<string, unknown> | undefined;
  const fakeFetch = async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return Response.json({
      success: true,
      error: null,
      data: {
        task: { id: 'task-1' },
        asset: { id: 'asset-1' },
        referenceCount: 0,
      },
    });
  };
  const result = await generateWorkspaceTarget('http://127.0.0.1:3200', {
    projectId: 'p1',
    targetType: 'shot',
    targetId: 'shot-1',
    targetLabel: '第 1 镜',
    prompt: 'rainy street',
    aspect: 'vertical',
    referenceImages: [{
      base64: 'iVBORw0KGgo=',
      mime: 'image/png',
    }],
  }, fakeFetch as typeof fetch);
  assert.equal(result.asset.id, 'asset-1');
  assert.equal(body?.targetType, 'shot');
  assert.equal(body?.prompt, 'rainy street');
  assert.deepEqual(body?.referenceImages, [{
    base64: 'iVBORw0KGgo=',
    mime: 'image/png',
  }]);
});
