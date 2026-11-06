import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('内测指南覆盖安装、示例项目、真机矩阵、反馈与退出条件', () => {
  const guide = fs.readFileSync('../docs/INTERNAL-TEST-GUIDE.md', 'utf8');

  for (const text of [
    '测试账号',
    '五分钟核心路径',
    '示例项目',
    '首轮真机矩阵',
    'Redmi',
    '华为',
    'iPhone',
    '内测反馈',
    '内测退出条件',
  ]) {
    assert.ok(guide.includes(text), `内测指南缺少 ${text}`);
  }
  assert.match(guide, /不提交 Apple App Store 或 Google Play/);
  assert.match(guide, /不要.*写死共享密码/);
});
