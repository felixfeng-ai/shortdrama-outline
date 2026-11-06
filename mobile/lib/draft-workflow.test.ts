import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DRAFT_MODEL,
  DRAFT_RESOLUTION,
  DRAFT_SECONDS,
  estimateDraftBatch,
  filterDraftTargets,
  newDraftBatchKey,
  submitDraftBatch,
  type DraftShotTarget,
} from './draft-workflow.ts';
import {
  draftFinalTargetIds,
  markDraftShotForFinal,
  resolveDraftShotFinal,
} from './draft-final-marks.ts';
import type { ReviewComment } from './review-comments-api.ts';
import type { WorkspaceVideoCapabilities } from './workspace-api.ts';

const capabilities: WorkspaceVideoCapabilities = {
  enabled: true,
  defaultModel: 'MiniMax-H3-Lite',
  defaultResolution: '768P',
  models: [{
    id: 'MiniMax-H3-Lite',
    minDuration: 4,
    maxDuration: 15,
    resolutions: ['480P', '768P'],
    pricesPerSecond: { '480P': 0.16, '768P': 0.26 },
  }],
};

const targets: DraftShotTarget[] = [
  {
    targetType: 'shot',
    targetId: 'shot-1',
    targetLabel: '第 1 集 · 第 1 镜 · 码头',
    episode: 1,
    shotNumber: 1,
    scene: '码头',
    prompt: 'rainy dock',
    duration: 7,
    ratio: '9:16',
    selectedFrameAssetId: 'frame-1',
    selectedVideoAssetId: null,
    latestTaskStatus: null,
    blockedReason: null,
  },
  {
    targetType: 'shot',
    targetId: 'shot-2',
    targetLabel: '第 1 集 · 第 2 镜 · 门口',
    episode: 1,
    shotNumber: 2,
    scene: '门口',
    prompt: 'open the door',
    duration: 5,
    ratio: '9:16',
    selectedFrameAssetId: null,
    selectedVideoAssetId: null,
    latestTaskStatus: 'failed',
    blockedReason: '先采用一张首帧',
  },
  {
    targetType: 'shot',
    targetId: 'shot-3',
    targetLabel: '第 2 集 · 第 1 镜 · 楼梯',
    episode: 2,
    shotNumber: 1,
    scene: '楼梯',
    prompt: 'walk upstairs',
    duration: 5,
    ratio: '9:16',
    selectedFrameAssetId: 'frame-3',
    selectedVideoAssetId: null,
    latestTaskStatus: null,
    blockedReason: null,
  },
];

test('草片按真实集号筛选，并分别统计可生成、缺首帧和全部镜头', () => {
  assert.deepEqual(
    filterDraftTargets(targets, 1).map((target) => target.targetId),
    ['shot-1', 'shot-2'],
  );
  assert.deepEqual(
    filterDraftTargets(targets, 1, true).map((target) => target.targetId),
    ['shot-1'],
  );
});

test('整集草片固定 480P 五秒，只对可生成镜头计费', () => {
  const estimate = estimateDraftBatch(capabilities, filterDraftTargets(targets, 1));

  assert.equal(DRAFT_MODEL, 'MiniMax-H3-Lite');
  assert.equal(DRAFT_RESOLUTION, '480P');
  assert.equal(DRAFT_SECONDS, 5);
  assert.equal(estimate.readyCount, 1);
  assert.equal(estimate.blockedCount, 1);
  assert.equal(estimate.estimatedCostMicros, 800_000);
  assert.equal(estimate.budgetLimitMicros, 800_000);
});

test('草片提交发送整集镜头，服务端可逐镜阻断且客户端带幂等键', async () => {
  let url = '';
  let body: Record<string, unknown> | undefined;
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    url = String(input);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      success: true,
      error: null,
      data: {
        batch: {
          id: 'batch-draft',
          projectId: 'p1',
          episode: 1,
          scope: { shotIds: ['shot-1'] },
          status: 'running',
          budgetLimitMicros: 800_000,
          reservedCostMicros: 800_000,
          actualCostMicros: 0,
          idempotencyKey: 'batch:draft-key',
          createdAt: 1,
          confirmedAt: 1,
          finishedAt: null,
        },
        tasks: [{ id: 'task-1', status: 'queued' }],
        blocked: [{ targetId: 'shot-2', reason: '缺少已采用首帧' }],
        failures: [],
      },
    });
  };

  const result = await submitDraftBatch(
    'http://127.0.0.1:3200',
    {
      projectId: 'p1',
      targets: filterDraftTargets(targets, 1),
      capabilities,
      idempotencyKey: 'draft-key',
    },
    fakeFetch as typeof fetch,
  );

  assert.equal(url, 'http://127.0.0.1:3200/api/video/generations/batch');
  assert.equal(body?.model, 'MiniMax-H3-Lite');
  assert.equal(body?.resolution, '480P');
  assert.equal(body?.budgetLimitMicros, 800_000);
  assert.deepEqual(
    (body?.shots as Array<Record<string, unknown>>).map((shot) => shot.targetId),
    ['shot-1', 'shot-2'],
  );
  assert.equal(result.batch?.id, 'batch-draft');
  assert.equal(result.blocked[0].targetId, 'shot-2');
});

test('草片幂等键可重复生成同一批次标识', () => {
  assert.equal(newDraftBatchKey(100, () => 0.5), 'mobile-draft-100-i');
});

function comment(overrides: Partial<ReviewComment>): ReviewComment {
  return {
    id: 'comment-1',
    projectId: 'p1',
    targetType: 'shot',
    targetId: 'shot-1',
    targetName: '第 1 镜 · 码头',
    body: '【定稿】草片通过，后续 768P/2K 出片',
    status: 'open',
    kind: 'final',
    timecodeMs: null,
    frameMarked: false,
    isBest: false,
    continuityStatus: 'not_checked',
    continuitySummary: '',
    continuityIssueCount: 0,
    authorId: 'user-1',
    createdAt: 1,
    updatedAt: 1,
    resolvedAt: null,
    ...overrides,
  };
}

test('定稿标记只识别开放镜头批注，普通审片批注不进入定稿队列', () => {
  const ids = draftFinalTargetIds([
    comment({}),
    comment({ id: 'comment-2', targetId: 'shot-2', body: '门口太暗', kind: 'comment' }),
    comment({ id: 'comment-3', targetId: 'shot-3', status: 'resolved' }),
  ]);
  assert.deepEqual([...ids], ['shot-1']);
});

test('标记和取消定稿沿用现有跨端镜头批注接口', async () => {
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: String(init?.method),
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    const patched = requests.length > 1;
    return Response.json({
      success: true,
      error: null,
      data: {
        comment: comment({
          id: patched ? 'comment-1' : 'comment-final',
          status: patched ? 'resolved' : 'open',
        }),
      },
    });
  };

  const marked = await markDraftShotForFinal(
    'http://127.0.0.1:3200',
    'p1',
    { targetId: 'shot-1', targetName: '第 1 镜 · 码头' },
    fakeFetch as typeof fetch,
  );
  await resolveDraftShotFinal(
    'http://127.0.0.1:3200',
    'p1',
    'comment-1',
    fakeFetch as typeof fetch,
  );

  assert.equal(marked.status, 'open');
  assert.equal(requests[0].url, 'http://127.0.0.1:3200/api/projects/p1/comments');
  assert.equal(requests[0].body.targetType, 'shot');
  assert.match(String(requests[0].body.body), /【定稿】/);
  assert.equal(requests[1].method, 'PATCH');
  assert.match(requests[1].url, /comments\/comment-1$/);
  assert.deepEqual(requests[1].body, { status: 'resolved' });
});
