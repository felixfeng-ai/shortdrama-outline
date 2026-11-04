import type { GenerationStatus, GenerationTask } from "./types.ts"

export interface TaskNoticeState {
  statuses: Record<string, GenerationStatus>
  unread: string[]
}

export interface TaskNoticeUpdate {
  state: TaskNoticeState
  notices: GenerationTask[]
}

const TERMINAL: ReadonlySet<GenerationStatus> = new Set([
  "succeeded",
  "failed",
  "canceled",
])

export function advanceTaskNotices(
  previous: TaskNoticeState | null,
  tasks: GenerationTask[],
): TaskNoticeUpdate {
  const statuses: Record<string, GenerationStatus> = {}
  for (const task of tasks) statuses[task.id] = task.status

  // 第一次看到这个项目时只建立基线。否则老项目一打开就会补发一屏历史通知。
  if (!previous) {
    return { state: { statuses, unread: [] }, notices: [] }
  }

  const unread = [...previous.unread]
  const notices: GenerationTask[] = []
  for (const task of tasks) {
    const before = previous.statuses[task.id]
    const enteredTerminal = TERMINAL.has(task.status) && before !== task.status
    const isNewTask = before === undefined
    if (!enteredTerminal) continue
    if (!unread.includes(task.id)) unread.push(task.id)
    if (!isNewTask || TERMINAL.has(task.status)) notices.push(task)
  }

  return {
    state: { statuses, unread },
    notices,
  }
}

export function clearTaskNotices(state: TaskNoticeState): TaskNoticeState {
  return { ...state, unread: [] }
}
