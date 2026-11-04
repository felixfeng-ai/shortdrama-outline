import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchReviewState,
  readReviewState,
  selectReviewAsset,
} from './review-api.ts';

const payload = {
  tasks: [{
    id: 'task-1',
    projectId: 'p1',
    targetType: 'shot',
    targetId: 'shot-1',
    providerId: 'aliyun',
    model: 'wanx',
    prompt: 'rain',
    promptHash: 'hash',
    status: 'succeeded',
    error: null,
    assetId: 'asset-1',
    createdAt: 100,
    startedAt: 110,
    finishedAt: 120,
  }],
  assets: [{
    id: 'asset-1',
    taskId: 'task-1',
    projectId: 'p1',
    targetType: 'shot',
    targetId: 'shot-1',
    storageKey: 'generated/p1/asset-1.png',
    mime: 'image/png',
    bytes: 2048,
    providerId: 'aliyun',
    model: 'wanx',
    prompt: 'rain',
    selectedAt: 130,
    createdAt: 120,
    downloadUrl: '/api/generated-assets/asset-1',
  }],
};

test('审片读取复用项目生成状态接口和凭据', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    init = options;
    return Response.json({ success: true, error: null, data: payload });
  };

  const state = await fetchReviewState(
    'http://127.0.0.1:3200/',
    'p1',
    'shot',
    'shot-1',
    fakeFetch as typeof fetch,
  );

  assert.match(url, /\/api\/generations\?/);
  assert.match(url, /projectId=p1/);
  assert.match(url, /targetType=shot/);
  assert.match(url, /targetId=shot-1/);
  assert.equal(init?.credentials, 'include');
  assert.equal(state.assets[0].id, 'asset-1');
});

test('审片采用调用既有 PATCH 接口', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    init = options;
    return Response.json({
      success: true,
      error: null,
      data: { asset: payload.assets[0] },
    });
  };

  const asset = await selectReviewAsset(
    'http://127.0.0.1:3200',
    'p1',
    'asset-1',
    fakeFetch as typeof fetch,
  );

  assert.equal(url, 'http://127.0.0.1:3200/api/generations');
  assert.equal(init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(init?.body)), {
    projectId: 'p1',
    assetId: 'asset-1',
  });
  assert.equal(asset.selectedAt, 130);
});

test('审片读取拒绝不完整响应', () => {
  assert.throws(() => readReviewState({ tasks: [], assets: [{}] }), /无法识别/);
});
