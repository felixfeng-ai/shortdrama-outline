import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEMO_STEPS,
  nextDemoStep,
  parseDemoProgress,
} from './demo-walkthrough.ts';

test('五分钟演示包含真实 Agent、生成、审片和 Web 同步步骤', () => {
  assert.deepEqual(DEMO_STEPS.map((step) => step.id), [
    'sample',
    'agent',
    'generate',
    'review',
    'sync',
  ]);
  assert.equal(nextDemoStep('sample'), 'agent');
  assert.equal(nextDemoStep('review'), 'sync');
  assert.equal(nextDemoStep('sync'), 'sync');
})

test('演示进度只恢复合法步骤', () => {
  assert.equal(parseDemoProgress('{"step":"review"}'), 'review');
  assert.equal(parseDemoProgress('{"step":"unknown"}'), 'sample');
  assert.equal(parseDemoProgress('broken'), 'sample');
})
