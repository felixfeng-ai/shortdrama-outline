import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { mapAgentResponse, type MobileAgentResponse } from './agent-api.ts';

test('Agent 视频预算卡映射为可核验的镜头、模型、费用和预算', () => {
  const response = {
    reply: '这两镜先按 Lite 768P 出草片。',
    toolNames: ['propose_video_plan'],
    cards: [{
      kind: 'video-plan',
      shotIds: ['shot-a', 'shot-b'],
      shotCount: 2,
      durationSeconds: 5,
      model: 'MiniMax-H3-Lite',
      resolution: '768P',
      estimatedCostMicros: 2_600_000,
      budgetLimitMicros: 3_000_000,
    }],
    modelCalls: 1,
    degraded: false,
  } as MobileAgentResponse;

  const result = mapAgentResponse(response, {
    projectTitle: '雨夜快递',
    contextLabel: '雨夜快递 · 第 1 集 · 场 1',
    targetLabel: '第 1 集 · 第 1 镜',
    evidence: '2 个镜头',
    shotCount: 2,
    sceneLabel: '门外',
  });

  assert.equal(result.proposal?.videoPlan?.shotCount, 2);
  assert.equal(result.proposal?.videoPlan?.durationSeconds, 5);
  assert.equal(result.proposal?.videoPlan?.model, 'MiniMax-H3-Lite');
  assert.equal(result.proposal?.videoPlan?.estimatedCostMicros, 2_600_000);
  assert.equal(result.proposal?.videoPlan?.budgetLimitMicros, 3_000_000);
});

test('Agent 提案卡界面展示视频预算字段', () => {
  const source = fs.readFileSync('components/agent-turn.tsx', 'utf8');
  for (const label of ['镜头数', '单镜时长', '模型', '预计费用', '预算上限']) {
    assert.ok(source.includes(label), `提案卡缺少 ${label}`);
  }
});
