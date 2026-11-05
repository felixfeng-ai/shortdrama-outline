import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchWorkspace,
  resolveApiBaseUrl,
  workspaceToAgentContext,
  type WorkspaceData,
} from './workspace-api.ts';

const payload: WorkspaceData = {
  activeProject: {
    id: 'p1',
    title: '夜港来信',
    episode: '第 3 集',
    step: '分镜',
    completedSteps: 6,
    pendingCount: 0,
    shotCount: 24,
    updatedLabel: '刚刚',
    status: 'complete',
    hasDetails: true,
  },
  projects: [],
  totalProjects: 1,
  hero: {
    episodeNumber: 3,
    episodeTitle: '潮汐之后',
    sceneNumber: 12,
    sceneLocation: '码头夜谈',
    timeOfDay: '夜外',
    sceneSummary: '林昭把信递出去',
    shotNumber: 17,
    shotCount: 24,
    contextBadge: 'EP03 · 场 12',
    agentContextLabel: '夜港来信 · 第 3 集 · 场 12',
    targetLabel: 'EP03 · 场 12 · 第 17 镜',
    evidence: '24 个镜头 · 林昭 V3 定妆',
  },
  quota: {
    remaining: 18,
    limit: 60,
    used: 42,
    projectsLeft: 1,
  },
  tasks: [
    {
      id: 'task-1',
      targetType: 'shot',
      targetId: 'shot-entity-17',
      targetLabel: '第 3 集 · 第 17 镜 · 码头夜谈',
      status: 'running',
      error: null,
      assetId: null,
      createdAt: Date.UTC(2026, 10, 4, 7, 59, 0),
      startedAt: Date.UTC(2026, 10, 4, 7, 59, 10),
      finishedAt: null,
      mediaKind: 'video',
      batchId: 'batch-1',
      estimatedCostMicros: 1_300_000,
      actualCostMicros: 0,
    },
  ],
  generationTargets: [
    {
      targetType: 'shot',
      targetId: 'shot-entity-17',
      targetLabel: '第 3 集 · 第 17 镜 · 码头夜谈',
      prompt: 'rainy dock',
      aspect: 'vertical',
    },
  ],
  videoCapabilities: {
    enabled: true,
    defaultModel: 'MiniMax-H3-Lite',
    defaultResolution: '768P',
    models: [{
      id: 'MiniMax-H3-Lite',
      minDuration: 4,
      maxDuration: 15,
      resolutions: ['768P'],
      pricesPerSecond: { '768P': 0.26 },
    }],
  },
  videoTargets: [{
    targetType: 'shot',
    targetId: 'shot-entity-17',
    targetLabel: '第 3 集 · 第 17 镜 · 码头夜谈',
    prompt: 'rainy dock',
    duration: 5,
    ratio: '9:16',
    selectedFrameAssetId: 'frame-1',
    selectedVideoAssetId: null,
    latestTaskStatus: 'running',
    blockedReason: null,
  }],
  videoReadiness: {
    totalShots: 24,
    frameReady: 20,
    videoReady: 3,
    missingFrame: 4,
    missingVideo: 21,
    activeTasks: 1,
    failedTasks: 0,
  },
  batches: [{
    id: 'batch-1',
    projectId: 'p1',
    episode: 3,
    scope: { shotIds: ['shot-entity-17'] },
    status: 'running',
    budgetLimitMicros: 1_300_000,
    reservedCostMicros: 1_300_000,
    actualCostMicros: 0,
    idempotencyKey: 'batch-key',
    createdAt: 1,
    confirmedAt: 1,
    finishedAt: null,
  }],
  agentMemory: {
    lockedCharacters: ['林昭 · 深蓝快递服'],
    lockedPlaces: ['码头 · 冷蓝夜雨'],
    acceptedDecisions: ['第 3 集钩子 → 车票留在门缝'],
    lockedDecisions: [],
    rejectedDirections: ['否决反转：缺少铺垫'],
    openComments: ['第 17 镜：门口太亮'],
  },
  pacing: {
    benchmark: {
      label: '成剧竖屏短剧基准',
      hookMinChars: 20,
      hookMaxChars: 80,
      dialogueCharsPerShotMax: 35,
      averageShotSecondsMax: 12,
      minimumShotsPerEpisode: 3,
    },
    summary: '已检查 1 集，发现 0 个节奏提醒。',
    rows: [{
      episode: 3,
      title: '潮汐之后',
      hookChars: 28,
      hookStatus: 'good',
      endingSuspense: 'open',
      shotCount: 24,
      dialogueChars: 120,
      dialogueCharsPerShot: 5,
      averageShotSeconds: 8,
      observations: [],
    }],
    warnings: [],
  },
};

test('API base URL is normalized and empty values fall back to local mode', () => {
  assert.equal(resolveApiBaseUrl(' http://127.0.0.1:3200/ '), 'http://127.0.0.1:3200');
  assert.equal(resolveApiBaseUrl(''), '');
  assert.equal(resolveApiBaseUrl(undefined), '');
});

test('workspace fetch uses the mobile context endpoint with credentials', async () => {
  let calledUrl = '';
  let calledInit: RequestInit | undefined;
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    calledUrl = String(url);
    calledInit = init;
    return new Response(JSON.stringify({ success: true, data: payload, error: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const data = await fetchWorkspace('http://127.0.0.1:3200/', fakeFetch as typeof fetch);

  assert.equal(calledUrl, 'http://127.0.0.1:3200/api/mobile/context');
  assert.equal(calledInit?.credentials, 'include');
  assert.equal(data.activeProject?.title, '夜港来信');
  assert.equal(data.tasks[0].targetLabel, '第 3 集 · 第 17 镜 · 码头夜谈');
  assert.equal(data.tasks[0].status, 'running');
  assert.equal(data.tasks[0].mediaKind, 'video');
  assert.equal(data.tasks[0].batchId, 'batch-1');
  assert.equal(data.generationTargets[0].targetId, 'shot-entity-17');
  assert.equal(data.videoCapabilities.defaultModel, 'MiniMax-H3-Lite')
  assert.equal(data.videoTargets[0].selectedFrameAssetId, 'frame-1')
  assert.equal(data.videoReadiness.missingVideo, 21)
  assert.equal(data.agentMemory.lockedCharacters[0], '林昭 · 深蓝快递服')
  assert.equal(data.pacing.rows[0].averageShotSeconds, 8)
});

test('workspace fetch can request a selected project', async () => {
  let calledUrl = '';
  const fakeFetch = async (url: string | URL | Request) => {
    calledUrl = String(url);
    return new Response(JSON.stringify({ success: true, data: payload, error: null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await fetchWorkspace(
    'http://127.0.0.1:3200',
    fakeFetch as typeof fetch,
    undefined,
    'project-2',
  );

  assert.match(calledUrl, /projectId=project-2/);
});

test('workspace fetch surfaces the server error message', async () => {
  const fakeFetch = async () =>
    new Response(JSON.stringify({ success: false, data: null, error: '会话已失效' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });

  await assert.rejects(
    () => fetchWorkspace('http://127.0.0.1:3200', fakeFetch as typeof fetch),
    /会话已失效/,
  );
});

test('workspace fetch distinguishes network and abort failures from server errors', async () => {
  const networkFailure = async () => {
    throw new Error('offline');
  };
  await assert.rejects(
    () => fetchWorkspace('http://127.0.0.1:3200', networkFailure as typeof fetch),
    /无法连接工作区/,
  );

  const abortFailure = async () => {
    throw new DOMException('cancelled', 'AbortError');
  };
  await assert.rejects(
    () => fetchWorkspace('http://127.0.0.1:3200', abortFailure as typeof fetch),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
});

test('workspace fetch rejects malformed or incomplete payloads', async () => {
  const notJson = async () => new Response('<html>broken</html>', { status: 200 });
  await assert.rejects(
    () => fetchWorkspace('http://127.0.0.1:3200', notJson as typeof fetch),
    /无法识别/,
  );

  const missingQuota = async () =>
    new Response(JSON.stringify({ success: true, error: null, data: { projects: [] } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  await assert.rejects(
    () => fetchWorkspace('http://127.0.0.1:3200', missingQuota as typeof fetch),
    /缺少额度信息/,
  );
});

test('remote workspace produces the native Agent context without hardcoded shot counts', () => {
  const context = workspaceToAgentContext(payload, payload.activeProject);

  assert.equal(context.projectTitle, '夜港来信');
  assert.equal(context.contextLabel, '夜港来信 · 第 3 集 · 场 12');
  assert.equal(context.shotCount, 24);
  assert.equal(context.targetLabel, 'EP03 · 场 12 · 第 17 镜');
  assert.match(context.evidence, /24 个镜头/);
  assert.equal(context.sceneLabel, '码头夜谈');
});

test('empty remote workspaces produce a neutral Agent context', () => {
  const context = workspaceToAgentContext(
    { ...payload, activeProject: null, hero: null, tasks: [] },
    null,
  );

  assert.equal(context.projectTitle, '未选择项目');
  assert.equal(context.contextLabel, '未选择项目');
  assert.equal(context.targetLabel, '等待项目内容');
  assert.equal(context.sceneLabel, '未选择项目');
});
