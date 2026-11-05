import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Agent 首页保留轻量结构并增加整集草片入口', () => {
  const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  assert.ok(home.includes("router.push('/draft')"));
  assert.ok(home.includes('整集草片'));
  assert.ok(home.includes('现场检查'));
  assert.ok(home.includes('节奏分析'));
  assert.ok(home.includes('海外审片'));
});

test('整集草片页覆盖分集、准备率、预算、部分阻断、任务和定稿状态', () => {
  const screen = fs.readFileSync('app/draft.tsx', 'utf8');
  for (const expected of [
    '整集草片',
    '480P',
    '5 秒',
    '预计费用',
    '缺首帧',
    '仅可生成',
    '独立失败',
    '查看任务',
    '需要定稿',
    '768P/2K',
  ]) {
    assert.ok(screen.includes(expected), `草片页缺少 ${expected}`);
  }
  assert.ok(screen.includes('useWorkspace'));
  assert.ok(screen.includes('useLocalSearchParams'));
  assert.ok(screen.includes('selectProject'));
  assert.ok(screen.includes('submitDraftBatch'));
  assert.ok(!screen.includes('Web 工作台'), '草片页不应把用户送回 Web 才能生成');
});
