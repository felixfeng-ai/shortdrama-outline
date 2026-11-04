'use client'

import { useState } from 'react'
import styles from './AmbientDirectorApp.module.css'

export default function AmbientDirectorApp() {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [accepted, setAccepted] = useState(false)

  return (
    <div className={styles.page}>
      <div className={styles.phone}>
        <div className={styles.statusBar} aria-hidden="true">
          <span>9:41</span>
          <span>● ● ●</span>
        </div>

        <header className={styles.header}>
          <div>
            <span className={styles.project}>《夜港来信》</span>
            <span className={styles.episode}>EP.03</span>
          </div>
          <div className={styles.presence}>
            <span className={styles.beacon} />
            <span>在场导演</span>
            <span className={styles.wave} aria-hidden="true"><i /><i /><i /></span>
          </div>
        </header>

        <main className={styles.main}>
          <section className={styles.scene} aria-label="第 3 集码头夜谈场景">
            <span className={styles.sceneGlow} />
            <span className={styles.sceneRain} />
            <span className={styles.skylineA} />
            <span className={styles.skylineB} />
            <span className={styles.water} />
            <span className={styles.pier} />
            <span className={styles.actorA} />
            <span className={styles.actorB} />
            <span className={styles.lamp} />
            <div className={styles.sceneHead}>
              <span>03-04</span>
              <b>码头夜谈</b>
            </div>
            <div className={styles.sceneFoot}>
              <span>林昭</span>
              <span>00:42:18</span>
            </div>
          </section>

          <section className={styles.discovery} aria-labelledby="discovery-title">
            <div className={styles.discoveryMeta}>
              <span className={styles.spark}>✦</span>
              <span>主动发现 · 机会</span>
              <small>刚刚</small>
            </div>
            <h1 id="discovery-title">
              林昭的台词
              <span>可以晚 8 秒</span>
            </h1>
            <p>让远轮汽笛落进停顿里。观众会先听到环境，再听见那句话。</p>
            <button type="button" className={styles.previewButton} onClick={() => setPreviewOpen(true)}>
              预览改动
              <span>↗</span>
            </button>
          </section>

          <div className={styles.timeline} aria-label="台词时间线">
            <span>00:39</span>
            <span className={styles.timelineLine}><i /></span>
            <b>+8s</b>
            <span>00:51</span>
          </div>

          <section className={styles.context}>
            <div><span>情绪</span><b>压低，不解释</b></div>
            <div><span>场景</span><b>雨夜码头</b></div>
            <div><span>影响</span><b>仅第 3 集</b></div>
          </section>
        </main>

        <footer className={styles.voiceDock}>
          <button type="button" className={styles.commandButton}>
            <span>轻说一句</span>
            <small>“再冷一点”</small>
          </button>
          <button type="button" className={styles.micButton} aria-label="按住说话">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
            </svg>
          </button>
        </footer>

        {previewOpen && (
          <div className={styles.sheetLayer}>
            <button type="button" className={styles.scrim} aria-label="关闭预览" onClick={() => setPreviewOpen(false)} />
            <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="预览 Agent 改动">
              <div className={styles.handle} />
              <div className={styles.sheetHead}>
                <div><span>预览改动</span><h2>让汽笛先发生</h2></div>
                <button type="button" className={styles.closeButton} onClick={() => setPreviewOpen(false)} aria-label="关闭">×</button>
              </div>
              <div className={styles.compare}>
                <div><span>现在</span><p>林昭：你哥没死。</p><small>00:42.2</small></div>
                <div className={styles.compareAfter}><span>Agent</span><p>（汽笛）……你哥没死。</p><small>00:50.2</small></div>
              </div>
              <p className={styles.sheetNote}>只调整台词起点，镜头和环境声保持不变。</p>
              <div className={styles.sheetActions}>
                <button type="button" onClick={() => setPreviewOpen(false)}>保留原稿</button>
                <button type="button" className={styles.acceptButton} onClick={() => { setAccepted(true); setPreviewOpen(false) }}>
                  {accepted ? '已采用' : '采用改动'}
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
      <p className={styles.demoNote}>{accepted ? '已采用改动 · ' : ''}C · Ambient Director · Agent 原生界面样机</p>
    </div>
  )
}
