import { test } from "node:test"
import assert from "node:assert/strict"

import { runAgentLoop, type AgentMessage, type LoopEvent } from "../lib/agent/loop.ts"

// ── AL 循环 ──
//
// ReAct 的翻车点只有两个：**无限循环**与**工具报错把循环打死**。
// 这两条都在下面钉住。另外额度是按「一次模型调用 = 1 单位」算的，
// 所以「调了几次模型」必须能被数出来——不然限额形同虚设。

const executors = {
  get_project_status: () => ({ ok: true, content: "项目『别墅夜戏』：人物✓ 分镜✗" }),
  boom: () => { throw new Error("工具内部炸了") },
}

/** 造一个「先要工具、收到结果后给答案」的假模型 */
function fakeModel(script: ("tool" | "reply")[]) {
  let i = 0
  const calls: AgentMessage[][] = []
  const call = async (messages: AgentMessage[]) => {
    calls.push(messages.map((m) => ({ ...m })))
    const step = script[Math.min(i, script.length - 1)]
    i += 1
    if (step === "tool") {
      return { toolCalls: [{ id: `t${i}`, name: "get_project_status", args: {} }] }
    }
    return { reply: "分镜还没生成，先做前四步。" }
  }
  return { call, calls }
}

test("AL1 模型直接回答：一次调用就收尾", async () => {
  const model = fakeModel(["reply"])
  const events: LoopEvent[] = []
  const r = await runAgentLoop("现在还有什么要处理", {
    callModel: model.call, executors, onEvent: (e) => events.push(e),
  })
  assert.equal(model.calls.length, 1)
  assert.equal(r.stoppedBy, "reply")
  assert.match(r.messages[r.messages.length - 1].content, /分镜还没生成/)
  assert.equal(events.filter((e) => e.type === "tool-call").length, 0)
})

test("AL2 先调工具再回答：工具结果要回填给模型，且过程可见", async () => {
  const model = fakeModel(["tool", "reply"])
  const events: LoopEvent[] = []
  const r = await runAgentLoop("现在有什么要处理", {
    callModel: model.call, executors, onEvent: (e) => events.push(e),
  })
  assert.equal(model.calls.length, 2)
  assert.equal(r.stoppedBy, "reply")
  // 第二次调用时，上下文里必须已经有工具结果
  const second = model.calls[1]
  assert.ok(second.some((m) => m.role === "tool" && m.content.includes("别墅夜戏")))
  assert.deepEqual(events.map((e) => e.type), ["tool-call", "tool-result", "reply"])
})

test("AL3 工具抛错不许把循环打死：错误作为结果回填，模型继续", async () => {
  let i = 0
  const calls: AgentMessage[][] = []
  const callModel = async (messages: AgentMessage[]) => {
    calls.push(messages.map((m) => ({ ...m })))
    i += 1
    if (i === 1) return { toolCalls: [{ id: "t1", name: "boom", args: {} }] }
    return { reply: "那个工具坏了，我按已知信息说。" }
  }
  const r = await runAgentLoop("查一下", { callModel, executors })
  assert.equal(r.stoppedBy, "reply")
  const toolMsg = calls[1].find((m) => m.role === "tool")
  assert.ok(toolMsg, "工具错误必须回填成一条 tool 消息")
  assert.match(toolMsg!.content, /error/)
  assert.match(toolMsg!.content, /工具内部炸了/)
})

test("AL4 模型停不下来时在步数上限收尾：不再多调一次模型", async () => {
  const model = fakeModel(["tool", "tool", "tool", "tool", "tool"])
  const events: LoopEvent[] = []
  const r = await runAgentLoop("一直查", {
    callModel: model.call, executors, maxModelCalls: 3, onEvent: (e) => events.push(e),
  })
  assert.equal(model.calls.length, 3, "上限是 3 次模型调用，不能再多")
  assert.equal(r.stoppedBy, "cap")
  assert.match(r.messages[r.messages.length - 1].content, /别墅夜戏/, "收尾时要把已查到的东西说出来")
})

test("AL5 模型调用本身失败：抛给调用方（由接口层决定是否降级）", async () => {
  const callModel = async () => { throw new Error("模型 400") }
  await assert.rejects(
    () => runAgentLoop("你好", { callModel, executors }),
    /模型 400/,
    "循环不该吞掉模型错误——降级是接口层的事",
  )
})

test("AL6 同一工具同样的参数被反复请求时，第二次起直接告知（不再执行）", async () => {
  let execCount = 0
  const spyExecutors = {
    get_project_status: () => { execCount += 1; return { ok: true, content: "项目状态" } },
  }
  let i = 0
  const callModel = async () => {
    i += 1
    if (i <= 2) return { toolCalls: [{ id: `t${i}`, name: "get_project_status", args: {} }] }
    return { reply: "好了。" }
  }
  const r = await runAgentLoop("查两次", { callModel, executors: spyExecutors, maxModelCalls: 5 })
  assert.equal(r.stoppedBy, "reply")
  assert.equal(execCount, 1, "同一个调用只该真执行一次，避免空转烧额度")
})
