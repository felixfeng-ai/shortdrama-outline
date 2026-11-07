"use client"

import { QUICK_TRIAL_VISUAL_UNITS } from "@/lib/production/quick-trial"

interface Props {
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}

/**
 * 快速试片进入视觉阶段前的费用确认。
 * 只确认定妆、场次、分镜和一张首帧；不生成镜头视频，避免首次体验成本失控。
 */
export default function QuickTrialVisualGate({ busy, onCancel, onConfirm }: Props) {
  return (
    <div className="wfx-impact-scrim" role="presentation">
      <section
        className="wfx-impact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wfx-quick-visual-title"
      >
        <header>
          <span>继续生成视觉样片</span>
          <h2 id="wfx-quick-visual-title">生成第 1 镜首帧</h2>
          <p>系统会完成角色定妆、场次和第一集分镜，并为第 1 镜生成一张首帧。</p>
        </header>
        <dl className="wfx-impact-metrics">
          <div><dt>需要额度</dt><dd>{QUICK_TRIAL_VISUAL_UNITS}</dd></div>
          <div><dt>分镜范围</dt><dd>第 1 集</dd></div>
          <div><dt>首帧</dt><dd>1 张</dd></div>
          <div><dt>视频</dt><dd>不生成</dd></div>
        </dl>
        <ul className="wfx-impact-facts">
          <li>不生成镜头视频</li>
          <li>不自动扩集</li>
          <li>结果进入同一项目</li>
          <li>失败会保留已完成阶段</li>
        </ul>
        <footer>
          <p>确认后按实际完成阶段结算；已生成内容不会因为后续步骤失败而丢失。</p>
          <div>
            <button className="wfx-button is-secondary" type="button" disabled={busy} onClick={onCancel}>
              暂不生成
            </button>
            <button className="wfx-button" type="button" disabled={busy} onClick={onConfirm}>
              {busy ? "正在生成…" : `确认生成 · ${QUICK_TRIAL_VISUAL_UNITS} 额度`}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
