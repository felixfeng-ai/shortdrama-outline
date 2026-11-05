import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { resolveFrameAssetId, shotFrameTarget } from './first-frame.ts';
import type {
  WorkspaceGenerationTarget,
  WorkspaceVideoTarget,
} from './workspace-api.ts';

const frameTarget: WorkspaceGenerationTarget = {
  targetType: 'shot',
  targetId: 'shot-17',
  targetLabel: '第 17 镜 · 门口',
  prompt: '雨夜门口，苏婉关门',
  aspect: 'vertical',
};

const videoTarget: WorkspaceVideoTarget = {
  targetType: 'shot',
  targetId: 'shot-17',
  targetLabel: '第 3 集 · 第 17 镜 · 门口',
  episode: 3,
  shotNumber: 17,
  scene: '门口',
  prompt: '雨夜门口，苏婉关门',
  duration: 5,
  ratio: '9:16',
  selectedFrameAssetId: null,
  selectedVideoAssetId: null,
  latestTaskStatus: null,
  blockedReason: '先采用一张首帧',
};

test('视频镜头能在 App 内找到同一镜头的首帧生成目标', () => {
  assert.equal(shotFrameTarget([frameTarget], videoTarget), frameTarget);
  assert.equal(
    shotFrameTarget([{ ...frameTarget, targetId: 'shot-other' }], videoTarget),
    null,
  );
});

test('刚生成的首帧立即成为视频输入，不要求刷新后才可用', () => {
  assert.equal(resolveFrameAssetId(null, 'frame-new'), 'frame-new');
  assert.equal(resolveFrameAssetId('frame-selected', 'frame-new'), 'frame-selected');
  assert.equal(resolveFrameAssetId(null, undefined), null);
});

test('生成页提供在 App 生成首帧并继续视频的真实动作', () => {
  const source = fs.readFileSync('app/generate.tsx', 'utf8');
  assert.match(source, /generateFirstFrame/);
  assert.match(source, /在 App 生成首帧/);
  assert.match(source, /setGeneratedFrames/);
  assert.match(source, /sourceAssetId: effectiveFrameAssetId/);
  assert.match(source, /generateTextVideo/);
  assert.match(source, /text-to-video/);
  assert.match(source, /直接生成视频/);
  assert.match(source, /文生视频/);
});
