import assert from 'node:assert/strict';
import test from 'node:test';

import type { WorkspaceQuota } from './workspace-api.ts';
import {
  quotaCostLabel,
  quotaPresetRows,
  quotaPriceVersionLabel,
  quotaProjectLabel,
} from './quota-view.ts';

const quota: WorkspaceQuota = {
  remaining: 38,
  limit: 65,
  used: 27,
  projectsLeft: 2,
  episodeCount: 30,
  projectCost: 19,
  pricingVersion: '2026-11-v1',
  estimates: {
    selected: { episodeCount: 30, units: 19, projectsLeft: 2 },
    presets: [
      { episodeCount: 60, units: 28, projectsLeft: 1 },
      { episodeCount: 10, units: 13, projectsLeft: 2 },
      { episodeCount: 30, units: 19, projectsLeft: 2 },
    ],
  },
};

test('额度卡按当前集数解释可跑项目', () => {
  assert.equal(quotaProjectLabel(quota), '可跑 2 部 30 集项目');
  assert.equal(quotaCostLabel(quota), '约 19 单位 / 部');
  assert.equal(quotaPriceVersionLabel(quota), '价格口径 2026-11-v1');
});

test('额度预设按集数升序展示服务端成本和项目数', () => {
  assert.deepEqual(quotaPresetRows(quota), [
    { episodeCount: 10, cost: '13 单位 / 部', projects: '还能 2 部' },
    { episodeCount: 30, cost: '19 单位 / 部', projects: '还能 2 部' },
    { episodeCount: 60, cost: '28 单位 / 部', projects: '还能 1 部' },
  ]);
});

test('旧额度数据不伪造集数和成本', () => {
  assert.equal(quotaProjectLabel({
    ...quota,
    episodeCount: 0,
    projectCost: 0,
    projectsLeft: 1,
  }), '可跑 1 个项目');
  assert.equal(quotaCostLabel({ ...quota, projectCost: 0 }), '项目成本待同步');
  assert.equal(quotaPriceVersionLabel({ ...quota, pricingVersion: 'legacy' }), '价格口径 待同步');
  assert.deepEqual(quotaPresetRows({ ...quota, estimates: { ...quota.estimates, presets: [] } }), []);
});
