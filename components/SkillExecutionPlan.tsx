'use client'

import type { SkillDefinition } from '@/lib/skills/catalog'
import type { SkillReadiness } from '@/lib/skills/intake'
import type { SkillExecutionPlan } from '@/lib/skills/plan'

interface Props {
  skill: SkillDefinition
  plan: SkillExecutionPlan
  readiness: SkillReadiness
  quotaRemaining: number | null
  agentOpen: boolean
  hasPrompt: boolean
  onClose: () => void
  onStart: () => void
}

export default function SkillExecutionPlan({
  skill,
  plan,
  readiness,
  quotaRemaining,
  agentOpen,
  hasPrompt,
  onClose,
  onStart,
}: Props) {
  const quotaBlocked = quotaRemaining !== null && plan.units.min > quotaRemaining
  const quotaTight = quotaRemaining !== null
    && plan.units.max > quotaRemaining
    && !quotaBlocked
  const blockedReason = !hasPrompt
    ? '先在输入框写下本轮要完成的任务'
    : !readiness.ready
      ? `还缺：${readiness.missing.join('、')}`
      : quotaBlocked
        ? `剩余 ${quotaRemaining} 创作额度，不足以启动本轮`
        : null

  return (
    <section
      id="skill-execution-plan"
      className="execution-plan"
      aria-label={`${skill.title}执行计划`}
      data-skill={skill.id}
    >
      <header className="execution-plan-head">
        <div>
          <span className="execution-plan-kicker">EXECUTION PLAN</span>
          <h2>{skill.title}</h2>
          <p>{plan.objective}</p>
        </div>
        <button type="button" className="execution-plan-close" onClick={onClose} aria-label="收起执行计划">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </header>

      <div className="execution-plan-action-wrap">
        <div className="execution-plan-action-copy">
          {blockedReason ? (
            <p className="execution-plan-blocked" role="status">{blockedReason}</p>
          ) : (
            <p className="execution-plan-ready">前置已满足，打开 Agent 后先生成执行轨迹。</p>
          )}
          {quotaTight && (
            <p className="execution-plan-warning" role="status">
              当前剩余 {quotaRemaining} 创作额度；本轮最多使用 {plan.units.max}，到顶会自动停止。
            </p>
          )}
          <small>打开 Agent 不等于写入；所有修改仍逐项确认。</small>
        </div>
        <button
          type="button"
          className="execution-plan-primary"
          disabled={Boolean(blockedReason) || agentOpen}
          onClick={onStart}
        >
          {agentOpen ? 'Agent 已打开' : '确认并交给 Agent'}
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="execution-plan-layout">
        <section className="execution-plan-steps" aria-labelledby="executionStepsTitle">
          <div className="execution-plan-section-head">
            <h3 id="executionStepsTitle">执行步骤</h3>
            <span>{plan.steps.length} 步 · 写入前确认</span>
          </div>
          <ol>
            {plan.steps.map((step, index) => (
              <li key={step.id}>
                <span className="execution-step-number">{String(index + 1).padStart(2, '0')}</span>
                <div className="execution-step-copy">
                  <b>{step.title}</b>
                  <p><span>输入</span>{step.input}</p>
                  <p><span>产物</span>{step.output}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="execution-plan-side">
          <div className="execution-plan-metrics">
            <span>
              <small>创作额度上限</small>
              <b>{plan.units.label}</b>
            </span>
            <span>
              <small>预计耗时</small>
              <b>{plan.timeLabel}</b>
            </span>
            <span>
              <small>写入边界</small>
              <b>{plan.writes ? '确认 diff 后写入' : '只读，不改项目'}</b>
            </span>
          </div>

          <section className="execution-plan-block">
            <h3>本次读取</h3>
            <ul>
              {plan.context.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section className="execution-plan-block">
            <h3>确认节点</h3>
            <ul>
              {plan.confirmations.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section className="execution-plan-block execution-plan-preview">
            <h3>产出预览</h3>
            <ul>
              {plan.outputPreview.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section className="execution-plan-block execution-plan-recovery">
            <h3>中断恢复</h3>
            <p>{plan.recovery}</p>
          </section>
        </aside>
      </div>
    </section>
  )
}
