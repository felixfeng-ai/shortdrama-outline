import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildMobileAgentState,
  readMobileAgentPrompt,
  runMobileAgentTurn,
} from '../lib/mobile-agent.ts'

const snapshots = {
  idea: { oneLine: '快递员替陌生人完成遗愿' },
  characters: [{ name: '陈默' }],
  acts: [{ title: '第一幕' }],
  episodes: [
    { number: 1, title: '签收', hook: '签字后继承了一笔遗产。', intensity: 4 },
    { number: 2, title: '交易', hook: '第一笔钱真的到账了。', intensity: 5 },
  ],
  visualCharacters: [{ name: '陈默' }],
  scenes: [{ number: 1, episode: 1, location: '别墅门外' }],
  shots: [
    {
      shot: 1,
      scene: '别墅门外',
      characters: ['陈默'],
      missingRefFor: ['陈默'],
      status: 'done',
      shotSize: '中景',
      camera: '固定',
      prompt: 'CHEN MO outside a villa',
      speaker: '',
      dialogue: '',
    },
  ],
}

test('mobile agent prompt is trimmed and bounded', () => {
  assert.equal(readMobileAgentPrompt('  检查一下第 1 镜  '), '检查一下第 1 镜')
  assert.throws(() => readMobileAgentPrompt(''), /说清楚/)
  assert.throws(() => readMobileAgentPrompt('长'.repeat(301)), /300/)
})

test('mobile AgentState is built from real snapshots', () => {
  const state = buildMobileAgentState({
    projectTitle: '快递员',
    snapshots,
    quota: { remaining: 20, limit: 65, projectsLeft: 1 },
  })

  assert.equal(state.projectTitle, '快递员')
  assert.equal(state.hasIdea, true)
  assert.equal(state.completed.characters, true)
  assert.equal(state.completed.shots, true)
  assert.equal(state.episodes.length, 2)
  assert.equal(state.shots[0].shot, 1)
  assert.equal(state.shots[0].missingRefFor[0], '陈默')
})

test('mobile agent loop executes tools, charges per model call and returns reply', async () => {
  const state = buildMobileAgentState({
    projectTitle: '快递员',
    snapshots,
    quota: { remaining: 20, limit: 65, projectsLeft: 1 },
  })
  let charges = 0
  let calls = 0

  const result = await runMobileAgentTurn(
    { prompt: '检查分镜里缺什么', state },
    {
      charge: () => {
        charges += 1
      },
      callModel: async () => {
        calls += 1
        if (calls === 1) {
          return {
            toolCalls: [{ id: 'call-1', name: 'audit_shots', args: {} }],
          }
        }
        return { reply: '第 1 镜缺陈默的参考图，先把图补上。' }
      },
    },
  )

  assert.equal(charges, 2)
  assert.equal(result.modelCalls, 2)
  assert.deepEqual(result.toolNames, ['audit_shots'])
  assert.match(result.reply, /参考图/)
})

test('proposal tools return cards without writing the project', async () => {
  const state = buildMobileAgentState({
    projectTitle: '快递员',
    snapshots,
    quota: { remaining: 20, limit: 65, projectsLeft: 1 },
  })
  let calls = 0

  const result = await runMobileAgentTurn(
    { prompt: '把第 1 镜动作改轻一点', state },
    {
      charge: () => {},
      callModel: async () => {
        calls += 1
        if (calls === 1) {
          return {
            toolCalls: [
              {
                id: 'call-1',
                name: 'propose_shot_edit',
                args: {
                  shot: 1,
                  target: 'action',
                  newText: '陈默停步，没有立刻敲门。',
                  summary: '先停一拍再敲门',
                },
              },
            ],
          }
        }
        return { reply: '我建议先停一拍，已生成待确认卡片。' }
      },
    },
  )

  assert.equal(result.cards.length, 1)
  assert.equal(result.cards[0].kind, 'shot-edit')
  assert.equal(state.shots[0].prompt, 'CHEN MO outside a villa')
})
