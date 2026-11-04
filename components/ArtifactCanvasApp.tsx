'use client'

import { useState } from 'react'
import styles from './ArtifactCanvasApp.module.css'

export default function ArtifactCanvasApp() {
  const [accepted, setAccepted] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  return (
    <div className={styles.page}>
      <div className={styles.phone}>
        <div className={styles.statusBar} aria-hidden="true">
          <span>9:41</span>
          <span>◒ ◒ ◒</span>
        </div>

        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.brandMark}>V</span>
            <div><b>成剧</b><small>ARTIFACT CANVAS</small></div>
          </div>
          <button type="button" className={styles.noteButton} onClick={() => setShowNotes((value) => !value)}>
            {showNotes ? '收起批注' : '2 条批注'}
          </button>
        </header>

        <main className={styles.main}>
          <section className={styles.docHead}>
            <div>
              <p>SCENE 42 / REVISION 03</p>
              <h1>雨停之前</h1>
            </div>
            <span>EP.03 · SHOT 17</span>
          </section>

          <div className={styles.metaRow}>
            <span>近景 · 车内 · 夜</span>
            <span>17 / 23</span>
            <span className={styles.changed}>1 处改写</span>
          </div>

          <article className={styles.document}>
            <p>
              林昭没有立刻回答。雨刷停在玻璃中央，像一句被切断的话。她看向后视镜里
              <mark>那盏没有熄灭的车灯</mark>，终于松开方向盘。
            </p>
            <p>
              林昭：<b>“你一直在后面？”</b>
            </p>
            <p>他知道，她没有在问路。</p>
          </article>

          <section className={styles.agentNote} aria-label="Agent 改写说明">
            <div className={styles.agentHead}>
              <span className={styles.agentSpark}>✦</span>
              <div><b>Agent 改写</b><small>保留原节奏，只改变信息落点</small></div>
            </div>
            <p>让“被看见”先于台词发生。车灯成为情绪触发器，不增加新的动作。</p>
            <dl>
              <div><dt>改动</dt><dd>1 句话</dd></div>
              <div><dt>风险</dt><dd>车灯意象可能过强</dd></div>
              <div><dt>影响</dt><dd>仅第 17 镜</dd></div>
            </dl>
          </section>

          {showNotes && (
            <section className={styles.notes} aria-label="页边批注">
              <div><span>前情</span><p>林昭在雨夜第一次承认自己记得那通电话。</p></div>
              <div><span>人物</span><p>克制，停顿比对白更重要。</p></div>
            </section>
          )}
        </main>

        <footer className={styles.footer}>
          <div>
            <span>{accepted ? '已接受改写' : '1 处差异等待判断'}</span>
            <small>{accepted ? '第 17 镜已更新' : '不会自动覆盖原稿'}</small>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setAccepted(false)}>
              保留原稿
            </button>
            <button type="button" className={styles.primary} onClick={() => setAccepted(true)}>
              {accepted ? '已接受' : '接受改写'}
            </button>
          </div>
        </footer>
      </div>
      <p className={styles.demoNote}>B · Artifact Canvas · Agent 原生界面样机</p>
    </div>
  )
}
