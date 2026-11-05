import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('审片页使用真实资产和图片，不再渲染静态分镜', () => {
  const review = fs.readFileSync('app/review/[id].tsx', 'utf8');
  const comments = fs.readFileSync('components/review-comments.tsx', 'utf8');
  const tasks = fs.readFileSync('app/(tabs)/tasks.tsx', 'utf8');

  assert.ok(review.includes("from 'expo-video'"), '视频审片没有使用原生播放器');
  assert.ok(review.includes('fetchReviewState'), '审片页没有读取真实生成资产');
  assert.ok(review.includes("from 'expo-image'"), '审片页没有使用真实图片组件');
  assert.ok(review.includes('selectReviewAsset'), '审片页没有接入采用接口');
  assert.ok(review.includes('mediaKind'), '审片页没有区分图片与视频');
  assert.ok(review.includes('A/B 对比'), '审片页没有版本对比');
  assert.ok(comments.includes('退回'), '审片页没有退回原因');
  assert.ok(review.includes('ReviewComments'), '审片页没有镜头批注');
  assert.ok(!review.includes('SceneFrame'), '审片页仍在渲染静态 SceneFrame');
  assert.ok(!review.includes('REVIEW_VERSIONS'), '审片页仍使用固定版本');
  assert.ok(tasks.includes('assetId'), '任务页没有提供真实审片入口');
});
