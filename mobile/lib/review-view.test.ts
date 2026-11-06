import assert from 'node:assert/strict';
import test from 'node:test';

import type { ReviewAsset } from './review-api.ts';
import {
  buildReviewMediaSource,
  buildReviewVideoSource,
  initialReviewAsset,
  reviewFileName,
  reviewMediaKinds,
  reviewAspectRatio,
  reviewVersionLabel,
  reviewVersions,
} from './review-view.ts';

function asset(id: string, createdAt: number, selectedAt: number | null = null): ReviewAsset {
  return {
    id,
    taskId: `task-${id}`,
    projectId: 'p1',
    targetType: 'shot',
    targetId: 'shot-1',
    storageKey: `generated/p1/${id}.png`,
    mime: 'image/png',
    bytes: 2048,
    providerId: 'aliyun',
    model: 'wanx',
    prompt: 'rain',
    mediaKind: 'image',
    durationMs: null,
    width: 1080,
    height: 1920,
    selectedAt,
    createdAt,
    downloadUrl: `/api/generated-assets/${id}`,
  };
}

test('版本按时间倒序并优先当前采用版本', () => {
  const versions = reviewVersions([
    asset('v1', 100),
    asset('v2', 200, 220),
    asset('v3', 300),
  ]);

  assert.deepEqual(versions.map((item) => item.id), ['v3', 'v2', 'v1']);
  assert.equal(initialReviewAsset(versions, 'v1')?.id, 'v2');
  assert.equal(initialReviewAsset(reviewVersions([asset('a', 100), asset('b', 200)]), 'b')?.id, 'b');
  assert.equal(reviewVersionLabel(versions, 0), 'V3');
  assert.equal(reviewVersionLabel(versions, 2), 'V1');
});

test('图片源使用鉴权头，比例跟随资产类型', () => {
  const state = buildReviewMediaSource(
    'http://127.0.0.1:3200/',
    asset('a', 100),
    { Authorization: 'Bearer token' },
  );
  assert.equal(state.uri, 'http://127.0.0.1:3200/api/generated-assets/a');
  assert.equal(state.headers?.Authorization, 'Bearer token');
  assert.equal(reviewAspectRatio('shot'), 9 / 16);
  assert.equal(reviewAspectRatio('character'), 3 / 4);
  assert.equal(reviewAspectRatio('place'), 16 / 9);
});

test('视频版本使用 MP4 文件名，并能与图片分开审片', () => {
  const video: ReviewAsset = {
    ...asset('video-1', 200),
    mime: 'video/mp4',
    mediaKind: 'video',
    durationMs: 5_000,
  };
  const assets = [asset('image-1', 100), video]
  assert.deepEqual(reviewMediaKinds(assets), ['image', 'video'])
  assert.deepEqual(reviewVersions(assets, 'video').map((item) => item.id), ['video-1'])
  assert.equal(reviewFileName(video), 'shot-shot-1-video-1.mp4')
  assert.equal(
    buildReviewVideoSource('http://127.0.0.1:3200', video, {}).contentType,
    'progressive',
  )
});
