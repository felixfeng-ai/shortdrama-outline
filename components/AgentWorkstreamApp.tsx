'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import styles from './AgentWorkstreamApp.module.css'

type RunStatus = 'running' | 'paused' | 'adopted'
type Sheet = 'project' | 'artifact' | 'approval' | null
type TraceStep = {
  id: string
  label: string
  detail: string
  tool: string
  duration: string
  state: 'done' | 'active' | 'waiting'
}

const STEPS: TraceStep[] = [
  {
    id: 'read',
    label: '读取第 3 集分镜',
    detail: '23 个镜头，6 个场次',
    tool: 'storyboard.read',
    duration: '412ms',
    state: 'done',
  },
  {
    id: 'timing',
    label: '检查台词时长',
    detail: '第 17 镜超出 2.4 秒',
    tool: 'dialogue.measure',
    duration: '1.2s',
    state: 'active',
  },
  {
    id: 'frames',
    label: '比对关键帧',
    detail: '等待台词结果',
    tool: 'keyframe.compare',
    duration: '—',
    state: 'waiting',
  },
]

function Icon({
  name,
  size = 20,
}: {
  name: 'project' | 'pause' | 'play' | 'takeover' | 'chevron' | 'plus' | 'mic' | 'send' | 'close' | 'expand' | 'check' | 'stop'
  size?: number
}) {
  const paths = {
    project: (
      <>
        <path d="M4 7.5h6l1.8 2H20v8.5H4z" />
        <path d="M4 7.5v-2h6l1.8 2" />
      </>
    ),
    pause: (
      <>
        <path d="M8 6v12M16 6v12" />
      </>
    ),
    play: <path d="m9 6 9 6-9 6z" />,
    takeover: (
      <>
        <path d="M5 19h14M7 15.5 15.5 7a2.1 2.1 0 0 1 3 3L10 18.5 6 19z" />
        <path d="m14.5 8 3 3" />
      </>
    ),
    chevron: <path d="m9 6 6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    mic: (
      <>
        <rect x="9" y="4" width="6" height="10" rx="3" />
        <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3M9 20h6" />
      </>
    ),
    send: <path d="M12 19V5m-6 6 6-6 6 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    expand: <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />,
    check: <path d="m5 12.5 4.2 4L19 7" />,
    stop: <rect x="7" y="7" width="10" height="10" rx="1.5" />,
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={name === 'play' || name === 'stop' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

function SceneFrame({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`${styles.sceneFrame} ${compact ? styles.sceneFrameCompact : ''}`} role="img" aria-label="夜港来信第 3 集，林砚在雨夜码头仓库前停下">
      <span className={styles.sceneSky} />
      <span className={styles.sceneSkylineA} />
      <span className={styles.sceneSkylineB} />
      <span className={styles.sceneWater} />
      <span className={styles.scenePier} />
      <span className={styles.sceneFigureA} />
      <span className={styles.sceneFigureB} />
      <span className={styles.sceneLamp} />
      <span className={styles.sceneRain} />
      <span className={styles.sceneScan} />
      <span className={styles.sceneMeta}><b>REC</b> · 03A</span>
      <span className={styles.sceneTimecode}>00:42:18</span>
      {!compact && (
        <>
          <span className={`${styles.sceneCorner} ${styles.sceneCornerTop}`} />
          <span className={`${styles.sceneCorner} ${styles.sceneCornerBottom}`} />
        </>
      )}
    </div>
  )
}

export default function AgentWorkstreamApp() {
  const [status, setStatus] = useState<RunStatus>('running')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [activeStep, setActiveStep] = useState('timing')
  const [input, setInput] = useState('')
  const [takeover, setTakeover] = useState(false)
  const [notes, setNotes] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!sheet && !takeover) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSheet(null)
        setTakeover(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sheet, takeover])

  useEffect(() => {
    if (!sheet) return
    closeRef.current?.focus()
  }, [sheet])

  function startTakeover() {
    setStatus('paused')
    setTakeover(true)
    window.requestAnimationFrame(() => inputRef.current?.focus())
  }

  function submitNote(event: FormEvent) {
    event.preventDefault()
    const text = input.trim()
    if (!text) return
    setNotes((current) => [...current, text])
    setInput('')
    setTakeover(false)
    setStatus('running')
  }

  const headline =
    status === 'running'
      ? '我正在把第 3 集的钩子往后推 8 秒'
      : status === 'adopted'
        ? '改动已采用，正在同步第 17 镜'
        : takeover
          ? '已暂停，可以直接接管这一步'
          : '已暂停，Agent 保持在当前步骤'

  return (
    <div className={styles.demoPage}>
      <div className={styles.demoMark} aria-hidden="true">
        <span>VEYAFRAME</span>
        <b>AGENT APP / LIVE RUN</b>
      </div>

      <div className={styles.phone}>
        <div className={styles.statusBar} aria-hidden="true">
          <span>9:41</span>
          <span className={styles.statusSignals}><i /><i /><i /></span>
        </div>

        <div className={styles.app}>
          <header className={styles.header}>
            <span className={styles.brand}>V</span>
            <button type="button" className={styles.projectButton} onClick={() => setSheet('project')}>
              <span>夜港来信</span>
              <small>第 3 集 · Agent 正在运行</small>
              <Icon name="chevron" size={15} />
            </button>
            <button type="button" className={styles.roundButton} aria-label="打开项目列表" onClick={() => setSheet('project')}>
              <Icon name="project" size={20} />
            </button>
          </header>

          <main className={styles.main}>
            <section className={styles.thread} aria-label="与 Agent 的对话">
              <div className={styles.userBubble}>
                把第 3 集的钩子再收紧一点，先不要改画面。
              </div>
              <div className={styles.agentMessage}>
                <div className={styles.agentIdentity}>
                  <span>V</span>
                  <div><b>成剧 Agent</b><small>正在看第 3 集 · 42 个镜头</small></div>
                </div>
                <p>
                  我先让观众看见沈砚收起信封，再听见林昭那句「你哥没死」。这样信息落点会更晚，
                  也不用增加新的镜头。
                </p>
                <div className={styles.workingLine} aria-live="polite">
                  <span className={`${styles.liveDot} ${status !== 'running' ? styles.pausedDot : ''}`} />
                  <b>{headline}</b>
                  <small>{status === 'running' ? '00:42' : status === 'adopted' ? '已同步' : '已暂停'}</small>
                </div>
              </div>
            </section>

            <section className={styles.traceSection} aria-labelledby="trace-title">
              <div className={styles.sectionHead}>
                <div>
                  <span>进度</span>
                  <h2 id="trace-title">Agent 正在处理</h2>
                </div>
                <small>3 个步骤</small>
              </div>

              <div className={styles.traceList}>
                {STEPS.map((step) => {
                  const expanded = activeStep === step.id
                  return (
                    <button
                      key={step.id}
                      type="button"
                      className={`${styles.traceRow} ${expanded ? styles.traceRowActive : ''}`}
                      onClick={() => setActiveStep(step.id)}
                      aria-expanded={expanded}
                    >
                      <span className={`${styles.traceStatus} ${step.state === 'active' ? styles.traceStatusActive : ''}`}>
                        {step.state === 'done' ? <Icon name="check" size={12} /> : <i />}
                      </span>
                      <span className={styles.traceCopy}>
                        <b>{step.label}</b>
                        <small>{step.detail}</small>
                      </span>
                      <span className={styles.traceDuration}>{step.duration}</span>
                      {expanded && <span className={styles.traceTool}>{step.tool}</span>}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className={styles.artifactSection} aria-labelledby="artifact-title">
              <div className={styles.sectionHead}>
                <div>
                  <span>生成结果</span>
                  <h2 id="artifact-title">第 17 镜 · 首帧</h2>
                </div>
                <button type="button" className={styles.textButton} onClick={() => setSheet('artifact')}>
                  展开 <Icon name="expand" size={13} />
                </button>
              </div>
              <button type="button" className={styles.artifactFrame} onClick={() => setSheet('artifact')}>
                <SceneFrame />
                <span className={styles.frameCaption}>
                  <span>雨夜码头 · 近景</span>
                  <b>一致性 86%</b>
                </span>
              </button>
            </section>

            <section className={styles.decisionSection} aria-labelledby="decision-title">
              <div className={styles.decisionMeta}>
                <span>需要你确认</span>
                <small>确认后才会写入</small>
              </div>
              <h2 id="decision-title">把林昭的台词晚 8 秒落下</h2>
              <p>汽笛先响，台词后落。保留沈砚收起信封的完整动作，不影响镜头时长。</p>
              <div className={styles.diff}>
                <div><span>现在</span><b>林昭：你哥没死。</b></div>
                <div><span>Agent</span><b>（汽笛）……你哥没死。</b></div>
              </div>
              <div className={styles.decisionActions}>
                <button type="button" className={styles.secondaryButton} onClick={() => setSheet('approval')}>
                  预览改动
                </button>
                <button type="button" className={styles.primaryButton} onClick={() => setSheet('approval')}>
                  处理这一步
                </button>
              </div>
            </section>

            {notes.length > 0 && (
              <section className={styles.notesSection} aria-label="你补充的约束">
                {notes.map((note, index) => (
                  <p key={`${note}-${index}`}><span>你</span>{note}</p>
                ))}
              </section>
            )}
          </main>

          <div className={styles.dock}>
            <div className={styles.dockStatus}>
              <span><i className={status === 'running' ? styles.dockPulse : ''} />{status === 'running' ? 'Agent 正在处理' : status === 'adopted' ? '正在同步改动' : '等待你的指令'}</span>
              <span>{takeover ? '接管模式' : '不会自动写回'}</span>
            </div>
            <form className={styles.composer} onSubmit={submitNote}>
              <button type="button" className={styles.composerTool} aria-label="添加文件">
                <Icon name="plus" size={19} />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={takeover ? '直接修改这一步，或补充你的判断…' : '补充约束，或接管这一步…'}
                aria-label="补充给 Agent 的指令"
              />
              <button type="button" className={styles.composerTool} aria-label="语音输入">
                <Icon name="mic" size={18} />
              </button>
              <button type="submit" className={styles.sendButton} disabled={!input.trim()} aria-label="发送">
                <Icon name="send" size={18} />
              </button>
            </form>
            <div className={styles.runControls}>
              <button
                type="button"
                onClick={() => setStatus(status === 'running' ? 'paused' : 'running')}
                disabled={status === 'adopted'}
              >
                <Icon name={status === 'running' ? 'pause' : 'play'} size={16} />
                {status === 'running' ? '暂停' : '继续'}
              </button>
              <button type="button" onClick={startTakeover} disabled={status === 'adopted'}>
                <Icon name="takeover" size={16} />
                接管
              </button>
              <button type="button" className={styles.stopButton} onClick={() => setStatus('paused')} disabled={status === 'adopted'}>
                <Icon name="stop" size={15} />
                停止
              </button>
            </div>
          </div>
        </div>

        {sheet && (
          <div className={styles.sheetLayer}>
            <button type="button" className={styles.sheetScrim} aria-label="关闭面板" onClick={() => setSheet(null)} />
            <section className={styles.sheet} role="dialog" aria-modal="true" aria-label="Agent 面板">
              <div className={styles.sheetHandle} />
              <div className={styles.sheetHead}>
                <div>
                  <span>
                    {sheet === 'project' ? '当前项目' : sheet === 'artifact' ? '当前产物' : '待确认改动'}
                  </span>
                  <h2>
                    {sheet === 'project' ? '夜港来信' : sheet === 'artifact' ? '第 17 镜 · 首帧' : '台词时序调整'}
                  </h2>
                </div>
                <button ref={closeRef} type="button" className={styles.roundButton} aria-label="关闭" onClick={() => setSheet(null)}>
                  <Icon name="close" size={19} />
                </button>
              </div>

              {sheet === 'project' && (
                <div className={styles.sheetBody}>
                  <button type="button" className={styles.projectOptionActive}>
                    <span className={styles.projectThumb}><SceneFrame compact /></span>
                    <span><b>夜港来信</b><small>第 3 集 · Agent 正在运行</small></span>
                    <Icon name="check" size={18} />
                  </button>
                  <button type="button" className={styles.projectOption}>
                    <span className={styles.projectThumbAlt}>雾</span>
                    <span><b>雾中来客</b><small>昨天更新</small></span>
                  </button>
                  <button type="button" className={styles.projectOption}>
                    <span className={styles.projectThumbAlt}>十</span>
                    <span><b>第十三次回拨</b><small>已完成 · 10 月 21 日</small></span>
                  </button>
                </div>
              )}

              {sheet === 'artifact' && (
                <div className={styles.sheetBody}>
                  <div className={styles.largeArtifact}><SceneFrame /></div>
                  <dl className={styles.artifactFacts}>
                    <div><dt>镜头</dt><dd>EP03 · 17</dd></div>
                    <div><dt>景别</dt><dd>近景</dd></div>
                    <div><dt>画幅</dt><dd>9:16</dd></div>
                    <div><dt>一致性</dt><dd>86%</dd></div>
                  </dl>
                  <button type="button" className={styles.primaryWide} onClick={() => setSheet('approval')}>
                    查看这一步的改动
                  </button>
                </div>
              )}

              {sheet === 'approval' && (
                <div className={styles.sheetBody}>
                  <p className={styles.approvalLead}>只调整第 17 镜的台词起点，不改画面和镜头长度。</p>
                  <div className={styles.compareRows}>
                    <div><span>现在</span><p>林昭：你哥没死。</p><small>0:34.2</small></div>
                    <div className={styles.compareAgent}><span>Agent</span><p>（汽笛）……你哥没死。</p><small>0:42.2</small></div>
                  </div>
                  <div className={styles.approvalActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setSheet(null)}>保留原稿</button>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => {
                        setStatus('adopted')
                        setSheet(null)
                      }}
                    >
                      采用这版
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <p className={styles.demoNote} role="status" aria-live="polite">
        {status === 'adopted' ? '已采用改动 · 当前仅为视觉样机' : 'Agent 原生界面样机 · 不是最终 App'}
      </p>
    </div>
  )
}
