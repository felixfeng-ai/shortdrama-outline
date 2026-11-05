import assert from 'node:assert/strict';
import test from 'node:test';

import { checkSceneContinuity, readContinuityReport } from './continuity-api.ts';

const report = {
  summary: '人物符合，门口光线偏暖。',
  issues: [{
    area: 'lighting',
    severity: 'warning',
    expected: '冷白感应灯',
    observed: '暖黄灯',
    evidence: '照片上方灯罩',
    suggestion: '换成冷白灯',
    promptPatch: 'cold white sensor light',
  }],
};

test('现场连续性客户端发送本机照片和当前镜头，不写本地存储', async () => {
  let request: { url: string; init?: RequestInit } | null = null;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    request = { url: String(input), init };
    return Response.json({ success: true, data: { report }, error: null });
  }) as typeof fetch;

  const result = await checkSceneContinuity(
    'http://127.0.0.1:3200',
    {
      projectId: 'project-1',
      targetId: 'shot-a',
      imageBase64: 'iVBORw0KGgo=',
      mime: 'image/png',
    },
    fetchImpl,
  );

  assert.equal(result.issues[0].promptPatch, 'cold white sensor light');
  assert.match(request!.url, /\/api\/mobile\/continuity$/);
  assert.equal(request!.init?.credentials, 'include');
  const body = JSON.parse(String(request!.init?.body));
  assert.equal(body.targetId, 'shot-a');
  assert.equal(body.imageBase64, 'iVBORw0KGgo=');
});

test('现场连续性响应不完整时拒绝展示伪结果', () => {
  assert.throws(() => readContinuityReport(null), /检查结果无法识别/);
  assert.throws(
    () => readContinuityReport({ summary: '', issues: [] }),
    /检查摘要/,
  );
});
