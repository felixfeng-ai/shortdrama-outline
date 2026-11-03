import type { ContinuityReport } from '@/lib/skills/continuity'

interface Props {
  report: ContinuityReport
  onOpenWorkspace: () => void
}

function shotLabel(episode: number, shot: number): string {
  return episode > 0 ? `第 ${episode} 集 · 第 ${shot} 镜` : `未标集 · 第 ${shot} 镜`
}

export default function ContinuityReportCard({ report, onOpenWorkspace }: Props) {
  const { summary } = report
  return (
    <section
      className="continuity-report"
      data-readonly={report.readOnly ? 'true' : 'false'}
      aria-label="镜头连续性检查报告"
    >
      <header className="continuity-report-head">
        <span>
          <b>镜头连续性检查</b>
          <small>已定位到集、场、镜</small>
        </span>
        <em>{summary.issueShots === 0 ? '通过' : `${summary.issueShots} 镜待处理`}</em>
      </header>

      <div className="continuity-stats">
        <span><b>{summary.totalShots}</b><small>检查镜头</small></span>
        <span><b>{summary.issueShots}</b><small>问题镜头</small></span>
        <span><b>{summary.issueCount}</b><small>具体问题</small></span>
        <span><b>{summary.episodesWithIssues}</b><small>涉及集数</small></span>
      </div>

      {report.repairQueue.length === 0 ? (
        <div className="continuity-clear">
          <b>当前分镜通过连续性检查</b>
          <span>没有发现锚点、参考图版本或时长档位问题。</span>
        </div>
      ) : (
        <div className="continuity-list">
          {report.repairQueue.map((item) => (
            <article key={item.entityId} className="continuity-row">
              <div className="continuity-row-head">
                <b>{shotLabel(item.episode, item.shot)}</b>
                <span>{item.scene || '未标场景'}</span>
                <i>{item.status === 'rework' ? '返修中' : item.status === 'done' ? '已出图' : '待制作'}</i>
              </div>
              <p>{item.reasons.slice(0, 3).join('；')}</p>
              <div className="continuity-actions">
                {item.actions.map((action) => <span key={action}>{action}</span>)}
              </div>
            </article>
          ))}
        </div>
      )}

      <footer className="continuity-report-foot">
        <span>只读检查</span>
        <span>写入 {report.writes ? '是' : '否'}</span>
        <span>模型调用 {report.modelCalls}</span>
        <span>额度消耗 {report.quotaCharged}</span>
        <button type="button" onClick={onOpenWorkspace}>去工作台逐镜处理</button>
      </footer>
    </section>
  )
}
