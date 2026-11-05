import type { DeterministicSkillReport } from '@/lib/skills/deterministic'

interface Props {
  report: DeterministicSkillReport
  onOpenWorkspace: () => void
}

const SEVERITY_LABEL = {
  blocking: '阻断',
  warning: '提醒',
  info: '建议',
} as const

export default function DeterministicSkillReportCard({ report, onOpenWorkspace }: Props) {
  return (
    <section className="deterministic-report" aria-label={report.title}>
      <header className="deterministic-report-head">
        <span>
          <b>{report.title}</b>
          <small>{report.projectTitle}</small>
        </span>
        <em>0 模型调用</em>
      </header>
      <p className="deterministic-summary">{report.summary}</p>
      <div className="deterministic-metrics">
        {report.metrics.map((metric) => (
          <span key={metric.label}>
            <b>{metric.value}</b>
            <small>{metric.label}</small>
          </span>
        ))}
      </div>
      {report.items.length > 0 && (
        <div className="deterministic-items">
          {report.items.map((item, index) => (
            <article key={`${item.title}-${index}`} className={`deterministic-item ${item.severity}`}>
              <span>{SEVERITY_LABEL[item.severity]}</span>
              <b>{item.title}</b>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      )}
      <div className="deterministic-tips">
        {report.tips.map((tip) => <p key={tip}>{tip}</p>)}
      </div>
      <footer className="deterministic-report-foot">
        <span>只读</span>
        <span>写入 {report.writes ? '是' : '否'}</span>
        <span>模型调用 {report.modelCalls}</span>
        <span>创作额度消耗 {report.quotaCharged}</span>
        <button type="button" onClick={onOpenWorkspace}>去工作台处理</button>
      </footer>
    </section>
  )
}
