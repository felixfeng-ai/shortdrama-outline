import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { buildWorkbenchCommand } from "../lib/workbench-command.ts"

const completed = {
  characters: true,
  acts: true,
  episodes: false,
  visuals: false,
  scenes: false,
  shots: false,
}

test("WBC1 当前任务、唯一阻塞和下一步都复用同一份项目事实", () => {
  const command = buildWorkbenchCommand({
    currentStep: 3,
    completed,
    hasIdea: true,
    shotDone: 0,
    shotTotal: 0,
    todoItems: [
      { id: "next", text: "下一步：生成分集剧情", step: "episodes", kind: "next" },
      { id: "missing-refs", text: "有 2 个镜头缺参考图", step: "visuals", kind: "fix" },
      { id: "rework-shots", text: "有 1 个镜头标了需返修", step: "shots", kind: "fix" },
    ],
  })

  assert.equal(command.current.step, "episodes")
  assert.equal(command.current.label, "第 3 步 · 分集剧情")
  assert.equal(command.current.detail, "等待生成")
  assert.equal(command.blocker?.id, "missing-refs")
  assert.equal(command.next?.id, "next")
})

test("WBC2 没有修复项时明确显示未发现阻塞，不伪造告警", () => {
  const command = buildWorkbenchCommand({
    currentStep: 4,
    completed: { ...completed, episodes: true },
    hasIdea: true,
    shotDone: 0,
    shotTotal: 0,
    todoItems: [
      { id: "next", text: "下一步：生成场次", step: "scenes", kind: "next" },
    ],
  })

  assert.equal(command.blocker, null)
  assert.equal(command.current.detail, "等待生成")
  assert.equal(command.next?.step, "scenes")
})

test("WBC3 空项目先提示写故事想法，下一步仍由待办清单决定", () => {
  const command = buildWorkbenchCommand({
    currentStep: 1,
    completed: {
      characters: false,
      acts: false,
      episodes: false,
      visuals: false,
      scenes: false,
      shots: false,
    },
    hasIdea: false,
    shotDone: 0,
    shotTotal: 0,
    todoItems: [
      { id: "start", text: "先在故事灵感里写下想法", step: "characters", kind: "next" },
    ],
  })

  assert.equal(command.current.detail, "等待故事想法")
  assert.equal(command.next?.id, "start")
})

test("WBC4 分镜完成后显示真实镜头完成数；全部处理完时不再制造下一步", () => {
  const command = buildWorkbenchCommand({
    currentStep: 6,
    completed: {
      characters: true,
      acts: true,
      episodes: true,
      visuals: true,
      scenes: true,
      shots: true,
    },
    hasIdea: true,
    shotDone: 8,
    shotTotal: 10,
    todoItems: [],
  })

  assert.equal(command.current.detail, "8 / 10 镜已完成")
  assert.equal(command.blocker, null)
  assert.equal(command.next, null)
})

test("WBC4b 主链已完成但仍有修复项时，阻塞不会伪装成另一条下一步", () => {
  const command = buildWorkbenchCommand({
    currentStep: 6,
    completed: {
      characters: true,
      acts: true,
      episodes: true,
      visuals: true,
      scenes: true,
      shots: true,
    },
    hasIdea: true,
    shotDone: 1,
    shotTotal: 3,
    todoItems: [
      { id: "missing-refs", text: "有 1 个镜头缺参考图", step: "visuals", kind: "fix" },
    ],
  })

  assert.equal(command.blocker?.id, "missing-refs")
  assert.equal(command.next, null)
})

test("WBC5 工作台组件挂载 todoItems，并提供当前任务/阻塞/下一步的单一决策区", () => {
  const component = fs.readFileSync("components/SignalOverview.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.ok(component.includes("todoItems: TodoItem[]"), "组件没有接收现有待办清单")
  assert.ok(component.includes("signal-command"), "缺少工作台命令区")
  assert.ok(component.includes("当前任务"), "缺少当前任务")
  assert.ok(component.includes("阻塞"), "缺少阻塞状态")
  assert.ok(component.includes("下一步"), "缺少下一步")
  assert.ok(component.includes("command.next"), "下一步没有使用待办首项")
  assert.ok(component.includes("command.blocker"), "阻塞没有使用待办修复项")
  assert.ok(page.includes("todoItems={todoItems}"), "页面没有把唯一待办事实源传进工作台")
  assert.ok(page.includes("currentStep={currentStep}"), "页面没有传入真实工作流步骤")
  assert.ok(css.includes(".signal-desk .signal-command"), "缺少命令区样式")
  assert.ok(css.includes(".signal-command-action"), "缺少可执行动作样式")
  assert.ok(
    css.includes(".signal-desk .signal-command-action") && css.includes("min-height: 44px"),
    "窄屏下一步动作不足 44px",
  )
})

test("WBC6 空项目优先故事输入；有项目时状态区移到故事输入之前", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const nonEmpty = page.indexOf("{!firstRun && signalOverview}")
  const idea = page.indexOf("<IdeaPanel")
  const empty = page.indexOf("{firstRun && signalOverview}")

  assert.ok(nonEmpty >= 0 && nonEmpty < idea, "有项目时决策区仍未进入故事输入之前")
  assert.ok(empty > idea, "空项目时决策区挤占了故事输入的首屏位置")
})
