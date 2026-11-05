import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('生成画面页提供视频模式、费用和首帧阻断说明', () => {
  const source = fs.readFileSync('app/generate.tsx', 'utf8');

  assert.ok(source.includes('generateWorkspaceVideo'), '生成页没有提交视频任务');
  assert.ok(source.includes('videoCapabilities'), '生成页没有读取视频能力');
  assert.ok(source.includes('selectedFrameAssetId'), '生成页没有绑定已采用首帧');
  assert.ok(source.includes('视频'), '生成页没有视频模式');
  assert.ok(source.includes('首帧'), '生成页没有说明首帧要求');
});
