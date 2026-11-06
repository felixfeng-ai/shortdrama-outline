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
    mediaKind: 'image',
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
    mediaKind: 'image',
    durationMs: null,
    width: 1080,
    height: 1920,
  }],
};

test('审片同时读取图片与视频状态并保留媒体类型', async () => {
  const urls: string[] = [];
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    urls.push(String(input));
    init = options;
    const video = String(input).includes('/api/video/');
    return Response.json({
      success: true,
      error: null,
      data: video ? { tasks: [], assets: [] } : payload,
    });
  };

  const state = await fetchReviewState(
    'http://127.0.0.1:3200/',
    'p1',
    'shot',
    'shot-1',
    fakeFetch as typeof fetch,
  );

  assert.equal(urls.length, 2)
  assert.match(urls[0], /\/api\/generations\?/);
  assert.match(urls[1], /\/api\/video\/generations\?/);
  assert.match(urls[0], /projectId=p1/);
  assert.match(urls[0], /targetType=shot/);
  assert.match(urls[0], /targetId=shot-1/);
  assert.equal(init?.credentials, 'include');
  assert.equal(state.assets[0].id, 'asset-1');
  assert.equal(state.assets[0].mediaKind, 'image');
  assert.equal(state.assets[0].width, 1080);
  assert.equal(state.assets[0].height, 1920);
});

test('图片审片采用调用图片接口，视频审片采用调用视频接口', async () => {
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
    { fetchImpl: fakeFetch as typeof fetch },
  );

  assert.equal(url, 'http://127.0.0.1:3200/api/generations');
  assert.equal(init?.method, 'PATCH');
  assert.deepEqual(JSON.parse(String(init?.body)), {
    projectId: 'p1',
    assetId: 'asset-1',
  });
  assert.equal(asset.selectedAt, 130);

  await selectReviewAsset(
    'http://127.0.0.1:3200',
    'p1',
    'asset-video',
    { fetchImpl: fakeFetch as typeof fetch, mediaKind: 'video' },
  );
  assert.equal(url, 'http://127.0.0.1:3200/api/video/generations');
});

test('审片读取拒绝不完整响应', () => {
  assert.throws(() => readReviewState({ tasks: [], assets: [{}] }), /无法识别/);
});
