import type { TodoItem } from './todo'
import type { StepKey } from './types'
import { STEPS } from './types'

export interface WorkbenchCommandInput {
  /** 工作流真实推进到哪一步，不等同于用户正在浏览的步骤 */
  currentStep: number
  completed: Record<StepKey, boolean>
  hasIdea: boolean
  shotDone: number
  shotTotal: number
  /** buildTodoList 的输出，顺序本身已经表达优先级 */
  todoItems: TodoItem[]
}

export interface WorkbenchCommand {
  current: {
    step: StepKey
    label: string
    detail: string
  }
  blocker: TodoItem | null
  next: TodoItem | null
}

/**
 * 把工作台最常用的三个判断压成一份视图模型。
 *
 * 这里不重新计算项目状态：当前步骤、完成态和待办顺序都由页面现有的
 * 唯一事实源传入。这个函数只决定「先展示哪一个」，避免首屏和待办面板
 * 各说一套。
 */
export function buildWorkbenchCommand(input: WorkbenchCommandInput): WorkbenchCommand {
  const step = STEPS.find((item) => item.index === input.currentStep) ?? STEPS[0]
  const allCompleted = STEPS.every((item) => input.completed[item.key])

  let detail = input.completed[step.key] ? '已生成' : '等待生成'
  if (step.key === 'shots' && input.shotTotal > 0) {
    detail = `${input.shotDone} / ${input.shotTotal} 镜已完成`
  } else if (!input.hasIdea && step.key === 'characters') {
    detail = '等待故事想法'
  } else if (allCompleted) {
    detail = '六步产物均已生成'
  }

  return {
    current: {
      step: step.key,
      label: `第 ${step.index} 步 · ${step.nav}`,
      detail,
    },
    blocker: input.todoItems.find((item) => item.kind === 'fix') ?? null,
    // 只有主链推进项才算「下一步」。主链已完成时，修复项已经在阻塞区出现，
    // 再把它复制到下一步会让用户误以为有两件事要做。
    next: input.todoItems.find((item) => item.kind === 'next') ?? null,
  }
}
