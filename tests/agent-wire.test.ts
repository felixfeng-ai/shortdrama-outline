import { test } from "node:test"
import assert from "node:assert/strict"

import { toWireMessages, MAX_WIRE_MESSAGES, MAX_WIRE_CONTENT } from "../lib/agent/wire.ts"

// ── AW 上送消息的翻译 ──
//
// 真实踩过的坑：重建消息时把 assistant 的 `tool_calls` 丢了。
// 上游要求每个 `tool` 结果都能对上一条 assistant 的 tool_calls（靠 id），
// 对不上就 400——而界面上只显示「AI 调用失败」，完全看不出是少了一个字段。
// 所以这条测试的重点不是格式好看，而是**调用与结果的配对不能断**。

test("AW1 assistant 的 tool_calls 必须原样带回去，且 id 与后续 tool 消息对得上", () => {
  const wire = toWireMessages([
    { role: 'user', content: "现在还有哪些要处理" },
    {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 't1', name: 'get_project_status', args: {} }],
    },
    { role: 'tool', content: "项目『别墅夜戏』：人物✓", toolCallId: 't1', toolName: 'get_project_status' },
  ])

  assert.equal(wire.length, 3)
  const assistant = wire[1]
  assert.ok(assistant.tool_calls, "tool_calls 被丢了（这正是那次 400 的原因）")
  assert.equal(assistant.tool_calls![0].id, 't1')
  assert.equal(assistant.tool_calls![0].type, 'function')
  assert.equal(assistant.tool_calls![0].function.name, 'get_project_status')
  assert.equal(assistant.tool_calls![0].function.arguments, '{}')

  const tool = wire[2]
  assert.equal(tool.role, 'tool')
  assert.equal(tool.tool_call_id, 't1', "tool 结果的 id 必须与上面的调用一致")
})

test("AW1b 工具参数被序列化成字符串（协议要字符串，不是对象）", () => {
  const wire = toWireMessages([
    { role: 'assistant', content: '', toolCalls: [{ id: 'x', name: 'search_docs', args: { question: '怎么导出' } }] },
  ])
  const args = wire[0].tool_calls![0].function.arguments
  assert.equal(typeof args, 'string')
  assert.deepEqual(JSON.parse(args), { question: '怎么导出' })
})

test("AW2 普通消息保持原样，角色非法的一律当 user", () => {
  const wire = toWireMessages([
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好，我能查项目状态' },
    { role: 'system', content: '我假装是 system' },
  ])
  assert.deepEqual(wire.map((m) => m.role), ['user', 'assistant', 'user'])
  assert.ok(!wire[2].tool_calls)
})

test("AW3 坏输入不炸：非数组返回空、字段缺省有兜底", () => {
  assert.deepEqual(toWireMessages(null), [])
  assert.deepEqual(toWireMessages('不是数组'), [])
  const wire = toWireMessages([{ role: 'assistant', content: '', toolCalls: [{ name: '' }, { name: 'ok', args: null }] }])
  assert.equal(wire[0].tool_calls!.length, 1, "没有 name 的调用要被丢掉")
  assert.equal(wire[0].tool_calls![0].function.arguments, '{}')
  assert.equal(wire[0].tool_calls![0].id, 'ok', "缺 id 时用 name 兜底，保证 tool 结果能对上")
})

test("AW4 上下文有上限：只带最近若干条，单条内容也会截断", () => {
  const many = Array.from({ length: MAX_WIRE_MESSAGES + 5 }, (_, i) => ({ role: 'user', content: `第 ${i} 条` }))
  const wire = toWireMessages(many)
  assert.equal(wire.length, MAX_WIRE_MESSAGES)
  assert.match(wire[wire.length - 1].content, /最后一条|第 \d+ 条/)

  const long = toWireMessages([{ role: 'user', content: 'x'.repeat(MAX_WIRE_CONTENT + 500) }])
  assert.equal(long[0].content.length, MAX_WIRE_CONTENT)
})
