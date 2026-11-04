'use client'

import { useState } from 'react'
import styles from './ToolConsoleApp.module.css'

type Decision = 'pending' | 'approved' | 'rejected'

const PLAN = [
  { code: '01', label: '读取 E03 分镜', state: 'done' },
  { code: '02', label: '检查台词时长', state: 'active' },
  { code: '03', label: '定位第 17 镜', state: 'done' },
  { code: '04', label: '等待批准 Patch', state: 'waiting' },
]

export default function ToolConsoleApp() {
  const [decision, setDecision] = useState<Decision>('pending')

  return (
    <div className={styles.page}>
      <div className={styles.phone}>
        <div className={styles.statusBar} aria-hidden="true">
          <span>9:41</span>
          <span>▮▮▮</span>
        </div>

        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.pulse} />
            <b>成剧 Agent</b>
          </div>
          <div className={styles.runState}>{decision === 'pending' ? '正在处理' : '已完成'}</div>
        </header>

        <main className={styles.main}>
          <section className={styles.context}>
            <span>第 3 集 · 第 17 镜 · 第 4 版</span>
            <h1>调整第 17 镜台词节奏</h1>
            <p>先检查台词长度，再给出最小改动。画面和镜头长度都不会变。</p>
          </section>

          <section className={styles.planSection}>
            <div className={styles.sectionHead}><b>执行计划</b><span>3 / 4</span></div>
            <div className={styles.plan}>
              {PLAN.map((step) => (
                <div key={step.code} className={`${styles.planStep} ${styles[step.state]}`}>
                  <span>{step.code}</span>
                  <b>{step.label}</b>
                  <small>{step.state === 'done' ? '完成' : step.state === 'active' ? '进行中' : '等待'}</small>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.toolsSection}>
            <div className={styles.sectionHead}><b>检查结果</b><span>3 项</span></div>
            <div className={styles.toolCall}>
              <div><span className={styles.op}>已读取</span><b>第 3 集分镜</b><small>412ms</small></div>
              <p>23 个镜头，6 个场次，已有 3 个角色锚点</p>
            </div>
            <div className={`${styles.toolCall} ${styles.warnCall}`}>
              <div><span className={`${styles.op} ${styles.warnOp}`}>发现问题</span><b>2 处台词可能超时</b><small>需要处理</small></div>
              <p>第 17 镜约 8.4 秒，第 21 镜约 7.1 秒；优先处理第 17 镜</p>
            </div>
            <div className={styles.toolCall}>
              <div><span className={styles.op}>已准备</span><b>缩短第 17 镜台词</b><small>等待确认</small></div>
              <p>只调整一句台词和出现时间，不改画面与镜头长度</p>
            </div>
          </section>

          <section className={`${styles.approval} ${decision !== 'pending' ? styles.decisionMade : ''}`}>
            <div className={styles.approvalHead}>
              <span>等待你确认</span>
              <small>会写入</small>
            </div>
            <p className={styles.target}>改动位置：第 3 集 · 第 17 镜台词</p>
            <div className={styles.diff}>
              <div><span>-</span><b>L17 “你还敢回来？”</b><small>8.4s</small></div>
              <div><span>+</span><b>L17 “你还敢回来。”</b><small>5.7s</small></div>
            </div>
            <div className={styles.approvalFoot}>
              <span>{decision === 'pending' ? '只改台词 · 不改画面' : decision === 'approved' ? '已写入第 5 版' : '未写入任何改动'}</span>
              <button type="button" className={styles.reject} onClick={() => setDecision('rejected')} disabled={decision !== 'pending'}>拒绝</button>
              <button type="button" className={styles.approve} onClick={() => setDecision('approved')} disabled={decision !== 'pending'}>
                {decision === 'approved' ? '已批准' : '批准'}
              </button>
            </div>
          </section>

          <section className={styles.trace} aria-label="活动记录">
            <div><span>09:42</span><b>完成分镜和台词检查</b></div>
            <div><span>09:42</span><b>生成第 17 镜调整方案</b></div>
            {decision !== 'pending' && <div><span>09:43</span><b>{decision === 'approved' ? '改动已写入第 5 版' : '改动已取消'}</b></div>}
          </section>
        </main>

        <footer className={styles.footer}>
          <div><span className={styles.pulse} /><b>{decision === 'pending' ? 'Agent 正在等待你的确认' : decision === 'approved' ? '改动已写入' : '没有写入改动'}</b></div>
          <button type="button" className={styles.stopButton}>停止</button>
        </footer>
      </div>
      <p className={styles.demoNote}>D · Tool Console · Agent 原生界面样机</p>
    </div>
  )
}
