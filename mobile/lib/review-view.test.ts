import assert from 'node:assert/strict';
import test from 'node:test';

import type { ReviewAsset } from './review-api.ts';
import {
  buildReviewImageSource,
  initialReviewAsset,
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
  const state = buildReviewImageSource(
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
