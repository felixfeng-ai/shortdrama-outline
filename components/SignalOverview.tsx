'use client'

import type { TodoItem } from '@/lib/todo'
import type { StepKey } from '@/lib/types'
import { STEPS } from '@/lib/types'
import { buildWorkbenchCommand } from '@/lib/workbench-command'

interface Props {
  /** 用户正在浏览的步骤，只影响六步轨道高亮 */
  current: number
  /** 工作流真实推进到的步骤，用于「当前任务」 */
  currentStep: number
  completed: Record<StepKey, boolean>
  onJump: (key: StepKey) => void
  canJump: (key: StepKey) => boolean
  todoItems: TodoItem[]
  hasIdea: boolean
  shotDone: number
  shotTotal: number
}

export default function SignalOverview({
  current,
  currentStep,
  completed,
  onJump,
  canJump,
  todoItems,
  hasIdea,
  shotDone,
  shotTotal,
}: Props) {
  const command = buildWorkbenchCommand({
    currentStep,
    completed,
    hasIdea,
    shotDone,
    shotTotal,
    todoItems,
  })
  const blockerStep = command.blocker
    ? STEPS.find((step) => step.key === command.blocker?.step)
    : null
  const nextStep = command.next
    ? STEPS.find((step) => step.key === command.next?.step)
    : null

  return (
    <section className="signal-overview" aria-label="项目总览">
      <div className="signal-command" aria-label="当前任务决策">
        <div className="signal-command-current">
          <span className="signal-command-label">当前任务</span>
          <strong>{command.current.label}</strong>
          <span className="signal-command-detail">{command.current.detail}</span>
        </div>

        <div className={`signal-command-blocker${command.blocker ? ' has-blocker' : ''}`}>
          <span className="signal-command-label">阻塞</span>
          <p>{command.blocker?.text ?? '未发现明确阻塞'}</p>
          {command.blocker && (
            <button
              type="button"
              className="signal-command-action"
              data-step={command.blocker.step}
              onClick={() => onJump(command.blocker!.step)}
            >
              去{blockerStep?.short ?? '相关步骤'}处理
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>

        <div className="signal-command-next">
          <span className="signal-command-label">下一步</span>
          <p>
            {command.next?.text
              ?? (command.blocker ? '主链已完成，先清除上方阻塞再导出交付' : '六步主链已处理完')}
          </p>
          {command.next ? (
            <button
              type="button"
              className="signal-command-action"
              data-step={command.next.step}
              onClick={() => onJump(command.next!.step)}
            >
              去{nextStep?.short ?? '下一步'}
              <span aria-hidden="true">→</span>
            </button>
          ) : (
            <span className="signal-command-detail">
              {command.blocker ? '阻塞清零后即可交付' : '没有待处理动作'}
            </span>
          )}
        </div>
      </div>

      <nav className="signal-flow" aria-label="六步工作流">
        {STEPS.map((step) => {
          const isCurrent = current === step.index
          const isDone = completed[step.key]
          const reachable = isDone || isCurrent || canJump(step.key)
          return (
            <button
              key={step.key}
              type="button"
              className={isCurrent ? 'now' : isDone ? 'done' : ''}
              onClick={() => reachable && onJump(step.key)}
              disabled={!reachable}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`${step.index}. ${step.nav}`}
            >
              {step.short}
            </button>
          )
        })}
      </nav>
    </section>
  )
}
