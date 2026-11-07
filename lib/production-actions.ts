import type { TodoItem } from "./todo.ts"

export interface ProductionActionDescriptor {
  id: TodoItem["id"]
  label: string
  step: TodoItem["step"]
  directFix: boolean
  filter: "issues" | null
}

/**
 * 把项目待办翻译成用户能直接执行的生产动作。
 * 只有确定性、不会上传素材或产生模型费用的修复才允许 directFix。
 */
export function describeProductionAction(item: TodoItem): ProductionActionDescriptor {
  if (item.id === "expired-shots") {
    return {
      id: item.id,
      label: "修复提示词",
      step: item.step,
      directFix: true,
      filter: null,
    }
  }
  if (item.id === "missing-refs") {
    return {
      id: item.id,
      label: "去定妆挂图",
      step: item.step,
      directFix: false,
      filter: null,
    }
  }
  if (item.id === "rework-shots") {
    return {
      id: item.id,
      label: "打开返修镜头",
      step: item.step,
      directFix: false,
      filter: "issues",
    }
  }
  return {
    id: item.id,
    label: item.kind === "fix" ? "打开处理" : "继续制作",
    step: item.step,
    directFix: false,
    filter: null,
  }
}
