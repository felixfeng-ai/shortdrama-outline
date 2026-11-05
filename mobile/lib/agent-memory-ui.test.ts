import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Agent 首页提供可展开的项目记忆层，不跳转管理面板', () => {
  const turn = fs.readFileSync('components/agent-turn.tsx', 'utf8');
  const memory = fs.readFileSync('components/agent-memory.tsx', 'utf8');
  const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');

  assert.ok(turn.includes('AgentMemory'), 'Agent 轮次没有挂载记忆层');
  assert.ok(memory.includes('它记住了什么'), '记忆入口文案缺失');
  assert.ok(memory.includes('本轮会读取'), '没有说明 Agent 本轮读取范围');
  assert.ok(memory.includes('lockedCharacters'), '没有展示锁定角色');
  assert.ok(memory.includes('rejectedDirections'), '没有展示被否决方向');
  assert.ok(home.includes('data.agentMemory'), '首页没有传入真实记忆数据');
})
