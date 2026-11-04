import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('App 提供法律、AI 说明与举报入口', () => {
  const me = fs.readFileSync('app/(tabs)/me.tsx', 'utf8');
  const legal = fs.readFileSync('app/legal.tsx', 'utf8');
  const report = fs.readFileSync('app/report.tsx', 'utf8');
  const review = fs.readFileSync('app/review/[id].tsx', 'utf8');
  assert.ok(me.includes("router.push('/legal')"));
  assert.ok(legal.includes('AI 生成'));
  assert.ok(legal.includes('隐私'));
  assert.ok(report.includes('submitContentReport'));
  assert.ok(review.includes("router.push('/report") || review.includes('pathname: \'/report\''));
});
