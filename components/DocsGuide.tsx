import type { ReactNode } from 'react'

import VeyaBrandMark from './VeyaBrandMark'

const FLOW = [
  ['01', '核心人物', '先明确角色身份、动机与人物弧光。'],
  ['02', '三幕大纲', '建立故事承诺、冲突升级与最终落点。'],
  ['03', '分集', '拆出每集剧情、结尾钩子和追看动力。'],
  ['04', '视觉定妆', '固定角色、地点和项目的视觉一致性。'],
  ['05', '场次', '把分集拆成可拍摄的场景与动作。'],
  ['06', '分镜', '生成逐镜提示词、首帧与镜头视频。'],
] as const

const START_PATHS = [
  {
    index: '01',
    title: '只有一句想法',
    description: '先探索方向，再补齐人物与分集。',
  },
  {
    index: '02',
    title: '已有小说或剧本',
    description: '导入原文，整理人物关系和改编计划。',
  },
  {
    index: '03',
    title: '继续当前项目',
    description: '从真实待办恢复，不重置已有版本。',
  },
] as const

const CHAPTERS = [
  {
    title: '快速开始',
    links: [
      ['platform-map', '平台能做什么'],
      ['quick-start', '完成第一部短剧'],
      ['project-flow', '认识六步工作流'],
    ],
  },
  {
    title: '创作与制作',
    links: [
      ['visual-output', '定妆、场景与首帧'],
      ['shot-video', '镜头视频'],
      ['timeline-final', '声音与时间线成片'],
    ],
  },
  {
    title: '交付与扩展',
    links: [
      ['export-delivery', '导出与外部交付'],
      ['novel-companion', '项目附赠小说稿'],
      ['skills-agent', '创作技能与 Agent'],
    ],
  },
  {
    title: '工作区与排障',
    links: [
      ['workspace-modes', '总览 / 创作 / 画布'],
      ['canvas-window', '全屏画布'],
      ['mobile-app', '手机 App 与跨端'],
      ['cost-recovery', '费用、恢复与版本'],
      ['faq', '常见问题'],
    ],
  },
] as const

function BookIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21.5v-16Z" />
    </svg>
  )
}

function ArrowIcon() {
  return <span aria-hidden="true">→</span>
}

function Callout({
  tone = 'note',
  title,
  children,
}: {
  tone?: 'note' | 'warn'
  title: string
  children: ReactNode
}) {
  return (
    <aside className={`docs-callout is-${tone}`}>
      <b>{title}</b>
      <div>{children}</div>
    </aside>
  )
}

function TutorialFigure({
  src,
  alt,
  label,
  points,
}: {
  src: string
  alt: string
  label: string
  points: readonly string[]
}) {
  return (
    <figure className="docs-figure">
      <div className="docs-figure-shot">
        {/* 原图入口让手机用户无需横向拖动，也能放大核对具体控件。 */}
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          aria-label={`查看${label}界面原图`}
        >
          <img
            src={src}
            alt={alt}
            width={1440}
            height={1000}
            loading="lazy"
            decoding="async"
          />
        </a>
        <span className="docs-figure-badge">{label}</span>
        <span className="docs-figure-expand" aria-hidden="true">原图 ↗</span>
      </div>
      <figcaption>
        <ol>
          {points.map((point) => <li key={point}>{point}</li>)}
        </ol>
      </figcaption>
    </figure>
  )
}

export default function DocsGuide() {
  return (
    <div className="docs-page">
      <header className="docs-topbar">
        <a className="docs-brand" href="/" aria-label="返回成剧工作台">
          <span className="docs-brand-mark"><VeyaBrandMark /></span>
          <b>VeyaFrame</b>
          <em>成剧</em>
        </a>
        <nav className="docs-topnav" aria-label="站点导航">
          <a className="active" href="/docs" aria-current="page">教程</a>
          <a href="/">工作台</a>
        </nav>
        <a className="docs-top-cta" href="/">立即创作 <ArrowIcon /></a>
      </header>

      <main className="docs-layout">
        <aside className="docs-sidebar" aria-label="教程章节">
          <div className="docs-side-title">
            <BookIcon />
            <span>成剧教程</span>
          </div>
          {CHAPTERS.map((chapter) => (
            <section key={chapter.title}>
              <b>{chapter.title}</b>
              {chapter.links.map(([id, label]) => (
                <a
                  key={id}
                  className={id === 'quick-start' ? 'active' : ''}
                  href={`#${id}`}
                >
                  {label}
                </a>
              ))}
            </section>
          ))}
        </aside>

        <article className="docs-article">
          <details className="docs-mobile-nav">
            <summary>教程章节</summary>
            <div>
              {CHAPTERS.flatMap((chapter) => chapter.links.map(([id, label]) => (
                <a key={id} href={`#${id}`}>{label}</a>
              )))}
            </div>
          </details>

          <header className="docs-hero">
            <p className="docs-kicker">QUICK START · ABOUT 8 MIN</p>
            <h1>完成第一部短剧</h1>
            <p className="docs-lede">
              从一句想法或已有原文开始，完成人物、分集、分镜、镜头视频和第一集成片。
              成剧把“从想法、原文到成片”的路径放在同一条项目链里，每个阶段都先告诉你需要准备什么、
              会产出什么，写入和付费前仍由你确认。
            </p>
            <div className="docs-hero-actions">
              <a href="#quick-start">开始第一次创作 <ArrowIcon /></a>
              <a href="/skills?mode=source">从已有小说或剧本开始</a>
            </div>

            <div className="docs-start-rail" aria-label="三种开始方式">
              {START_PATHS.map((item) => (
                <div key={item.index}>
                  <i>{item.index}</i>
                  <b>{item.title}</b>
                  <span>{item.description}</span>
                </div>
              ))}
            </div>

            <figure className="docs-hero-preview">
              <div className="docs-hero-preview-shot">
                <a
                  href="/docs/tutorial/01-quick-start.png"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="查看工作台当前项目界面原图"
                >
                  <img
                    src="/docs/tutorial/01-quick-start.png"
                    alt="VeyaFrame 工作台当前项目总览"
                    width={1440}
                    height={1000}
                    loading="eager"
                    decoding="async"
                  />
                </a>
                <span className="docs-hero-preview-label">工作台 · 当前项目</span>
              </div>
              <figcaption>
                <span>先看当前阻断与下一步，再进入具体步骤。</span>
                <a href="/docs/tutorial/01-quick-start.png" target="_blank" rel="noreferrer">
                  查看原图 ↗
                </a>
              </figcaption>
            </figure>
          </header>

          <section id="platform-map" className="docs-section">
            <p className="docs-section-kicker">01 / PLATFORM MAP</p>
            <h2>平台能做什么</h2>
            <p>
              你可以从一句想法、已有小说或剧本文本开始，逐步得到人物设定、三幕大纲、分集、视觉定妆、
              场次、分镜和镜头首帧。每一个已采用首帧都可以继续生成镜头视频，再进入按集时间线完成配音、
              配乐、字幕和成片渲染。
            </p>
            <div className="docs-plane-grid">
              <div>
                <b>创作层</b>
                <span>人物、三幕、分集与场次</span>
                <small>先把故事和叙事节奏做对。</small>
              </div>
              <div>
                <b>资产层</b>
                <span>定妆、地点、首帧与镜头视频</span>
                <small>用锚点和参考图保持跨镜一致。</small>
              </div>
              <div>
                <b>成片层</b>
                <span>TTS、BGM、SRT、时间线与 MP4</span>
                <small>按集渲染，也可继续交给外部平台精剪。</small>
              </div>
            </div>
          </section>

          <section id="quick-start" className="docs-section">
            <p className="docs-section-kicker">02 / QUICK START</p>
            <h2>开始第一次创作</h2>
            <ol className="docs-steps">
              <li>
                <b>选择工作面</b>
                <p>从左侧菜单进入“首页”查看当前任务，或在“创作技能”里从想法、原文和当前项目开始。</p>
              </li>
              <li>
                <b>生成核心人物</b>
                <p>确认角色身份、动机和人物弧光。人物是后续一致性的基准。</p>
              </li>
              <li>
                <b>沿六步继续</b>
                <p>依次完成三幕、分集、定妆、场次和分镜。未完成的前置步骤会阻止下一步生成。</p>
              </li>
              <li>
                <b>先采用首帧</b>
                <p>进入分镜后，为需要生成视频的镜头选择一张已采用首帧。</p>
              </li>
              <li>
                <b>生成视频与成片</b>
                <p>在第 6 步打开“镜头视频”，完成后进入“时间线成片”；需要更大空间时可从画布页头打开全屏画布。</p>
              </li>
            </ol>
            <Callout title="第一次使用">
              可以先载入示例项目，查看完整六步和成片入口；示例不会调用模型，也不消耗创作额度。
            </Callout>
          </section>

          <section id="project-flow" className="docs-section">
            <p className="docs-section-kicker">03 / SIX-STEP FLOW</p>
            <h2>认识六步工作流</h2>
            <div className="docs-flow-strip" aria-label="从想法到成片">
              {['想法 / 原文', '人物与分集', '场次与分镜', '首帧与视频', '声音与成片'].map((item, index) => (
                <span key={item}>
                  <i>{String(index + 1).padStart(2, '0')}</i>
                  <b>{item}</b>
                </span>
              ))}
            </div>
            <div className="docs-step-list">
              {FLOW.map(([index, title, description]) => (
                <div key={index}>
                  <span>{index}</span>
                  <b>{title}</b>
                  <p>{description}</p>
                </div>
              ))}
            </div>
            <p>
              六步是项目内部流程，不是六个独立工具。编辑人物会影响下游定妆和分镜的过期检查，
              修改场次会影响镜头结构，时间线则只读取已固化的镜头与声音版本。
            </p>
          </section>

          <section id="visual-output" className="docs-section">
            <p className="docs-section-kicker">04 / VISUAL ASSETS</p>
            <h2>定妆、场景与首帧</h2>
            <p>
              视觉定妆把角色的外观、服装和光线固定成可复用的文字锚点。地点场景图负责统一同一个空间的
              空间结构、陈设和色调。镜头首帧会按出场角色和地点自动带入已采用参考图。
            </p>
            <TutorialFigure
              src="/docs/tutorial/02-visual-assets.png"
              alt="视觉定妆工作区，展示角色视觉锚点说明和批量生成角色定妆选项"
              label="第 4 步 · 视觉定妆"
              points={[
                '定妆卡把角色的脸、发型、服装和光线固定成可复用锚点。',
                '批量生成按角色逐项运行，结果先进入候选，不会自动覆盖已采用图片。',
                '场景图与镜头首帧沿用同一套画幅、地点和角色参考规则。',
              ]}
            />
            <Callout title="一致性原则" tone="warn">
              只有平台生成并明确采用的图片会进入参考图链路。本地图库原图默认不上传；
              如果参考图过期或缺少关键角色，先修复提示词或重新生成，再继续视频。
            </Callout>
          </section>

          <section id="shot-video" className="docs-section">
            <p className="docs-section-kicker">05 / SHOT VIDEO</p>
            <h2>镜头视频</h2>
            <p>
              第 6 步顶部有三个工作区：<b>分镜</b>、<b>镜头视频</b>和<b>时间线成片</b>。
              打开“镜头视频”后，选择当前集的一镜或多镜，核对模型、分辨率、时长与预算，再提交任务。
            </p>
            <TutorialFigure
              src="/docs/tutorial/03-shot-video.png"
              alt="分镜第 6 步的镜头视频页签，展示分镜、镜头视频、时间线成片三个工作区和批量视频入口"
              label="第 6 步 · 镜头视频"
              points={[
                '在分镜、镜头视频、时间线成片三个页签之间切换，不需要离开当前集。',
                '图生视频先要求采用首帧；没有首帧的镜头会明确列为缺失项。',
                '提交前核对模型、时长和预算，生成结果仍需由你采用。',
              ]}
            />
            <ul className="docs-checklist">
              <li>图生视频必须先为镜头采用首帧。</li>
              <li>每次生成结果先进入候选，不会自动替换当前采用视频。</li>
              <li>切换菜单或刷新页面后，任务仍可从服务端恢复。</li>
              <li>失败镜头可以单独重试，不影响同批其他镜头。</li>
              <li>外部路径仍可继续导出到即梦或可灵。</li>
            </ul>
          </section>

          <section id="timeline-final" className="docs-section">
            <p className="docs-section-kicker">06 / AUDIO & FINAL CUT</p>
            <h2>声音与时间线成片</h2>
            <p>
              在“时间线成片”中，系统按集号和镜号建立初始顺序。你可以重排、裁剪、静音和替换素材，
              并为角色绑定系统音色、生成 TTS、选择 BGM 和调整音量。
            </p>
            <TutorialFigure
              src="/docs/tutorial/04-timeline.png"
              alt="时间线成片工作区，展示按集时间线、角色音色和本集成片操作"
              label="第 6 步 · 时间线成片"
              points={[
                '时间线按集号和镜号建立初始顺序，再允许你重排、裁剪和替换素材。',
                '角色音色、TTS、BGM 与字幕都在同一成片上下文中处理。',
                '缺镜、对白溢出或 BGM 授权缺失会阻止渲染，不制造已完成假象。',
              ]}
            />
            <div className="docs-artifact-table">
              <div><b>TTS</b><span>把角色台词生成为逐镜对白音频。</span></div>
              <div><b>BGM</b><span>进入独立配乐轨，必须确认使用授权。</span></div>
              <div><b>SRT</b><span>按实际时间线和台词生成旁挂字幕。</span></div>
              <div><b>MP4</b><span>合成视频、对白、BGM 和统一画幅。</span></div>
              <div><b>manifest</b><span>记录时间线版本、素材指纹、模型和 AI 来源。</span></div>
            </div>
            <Callout title="完整成片门槛">
              缺镜、缺对白、对白溢出或 BGM 授权缺失时，渲染会被阻止。
              平台不会用静默裁切或加速制造“已完成”的假象。
            </Callout>
          </section>

          <section id="export-delivery" className="docs-section">
            <p className="docs-section-kicker">07 / DELIVERY</p>
            <h2>导出与外部交付</h2>
            <p>
              平台内成片路径输出 MP4、SRT 和 render manifest；外部路径继续提供逐镜提示词、
              首帧、参数、预检和平台执行清单。导出统一从工作区顶栏的“导出交付包”进入。
            </p>
            <TutorialFigure
              src="/docs/tutorial/05-export.png"
              alt="VeyaFrame 工作区顶栏导出交付包完成状态，展示预检结果和导出文件数量"
              label="顶栏 · 导出交付包"
              points={[
                '导出前先执行阻断和提醒预检，结果会写进项目报告。',
                '交付包用于审阅和下游执行，只包含已采用资产；完整备份用于恢复。',
                '平台内成片下载 MP4、SRT 和 manifest；外部路径可继续交给即梦、可灵或剪映。',
              ]}
            />
            <div className="docs-split">
              <div>
                <b>平台内成片</b>
                <p>下载 MP4、SRT 和 manifest，或按集重新渲染历史时间线版本。</p>
              </div>
              <div>
                <b>外部平台</b>
                <p>导出到即梦、可灵或剪映交付包，继续使用外部模型或做专业精剪。</p>
              </div>
            </div>
          </section>

          <section id="novel-companion" className="docs-section">
            <p className="docs-section-kicker">08 / NOVEL COMPANION</p>
            <h2>项目附赠小说稿</h2>
            <p>
              小说稿从项目条导出菜单进入，不增加第七步。它复用已有人物、三观、分集、场次、
              分镜动作与对白、Canon 和项目原文，用户可以先生成一份可编辑的长篇连载初稿。
            </p>
            <TutorialFigure
              src="/docs/tutorial/09-novel-workspace.png"
              alt="VeyaFrame 小说工作台，左侧卷章目录、中间正文编辑和右侧质量检查"
              label="小说稿 · 卷章与正文编辑"
              points={[
                '先选篇幅并确认预算，再按章节低优先级生成；媒体任务运行时自动等待。',
                '正文旁边持续显示当前章节来源集、Canon 项目和确定性质检结果。',
                '每一章可以手改、重写、生成去 AI 味候选，并保留 append-only 版本。',
              ]}
            />
            <ul className="docs-checklist">
              <li>默认不生成、不导出；先选篇幅，再确认章节、字数、Token、额度和预计耗时。</li>
              <li>小说任务低于图片、视频、音频和成片渲染；媒体任务运行时会自动等待，并按章节游标恢复。</li>
              <li>章节版本 append-only；上游改动只标记过期，不静默覆盖已编辑正文。</li>
              <li>去 AI 味先生成候选修订，用户确认后才写入；支持 Markdown、TXT、DOCX、EPUB 和 ZIP。</li>
            </ul>
          </section>

          <section id="workspace-modes" className="docs-section">
            <p className="docs-section-kicker">09 / WORKSPACE MODES</p>
            <h2>总览 / 创作 / 画布</h2>
            <p>
              三个工作面属于同一个项目，不会丢失当前项目和步骤。总览负责当前阻断与下一步，
              创作复用完整技能库和 Agent，画布负责查看节点、依赖和人工编排。
            </p>
            <TutorialFigure
              src="/docs/tutorial/06-workspace-create.png"
              alt="VeyaFrame 创作模式，展示创作技能、执行计划和右侧圆形 Agent 图标"
              label="创作模式 · 技能与计划"
              points={[
                '创作模式保留技能分类、图片、搜索和执行计划，不切换项目。',
                '右侧执行计划先说明读取范围、产物、写入边界与确认节点。',
                '“问场记”使用圆形 Veya 图标；桌面侧舱和手机抽屉共用同一 Agent。',
              ]}
            />
          </section>

          <section id="canvas-window" className="docs-section">
            <p className="docs-section-kicker">10 / FULLSCREEN CANVAS</p>
            <h2>全屏画布</h2>
            <p>
              工作区里的“画布”主入口仍在当前页面打开。需要并排审阅或更大的拖拽空间时，
              点击画布页头的“在新窗口打开”，会进入不包含侧栏、公告和模式条的独立全屏画布。
            </p>
            <TutorialFigure
              src="/docs/tutorial/07-fullscreen-canvas.png"
              alt="VeyaFrame 独立全屏编排画布，展示节点、依赖线、缩放和节点属性面板"
              label="独立窗口 · 全屏编排画布"
              points={[
                '新窗口保留当前项目和当前步骤，不会打开一个重复的完整工作台。',
                '画布占满窗口，节点拖拽、缩放、连线、自动保存和多标签同步继续可用。',
                '关闭新窗口即可回到原工作台，原工作台状态不受影响。',
              ]}
            />
          </section>

          <section id="mobile-app" className="docs-section">
            <p className="docs-section-kicker">11 / MOBILE & CONTINUITY</p>
            <h2>手机 App 与跨端</h2>
            <p>
              桌面顶栏“下载手机 App”会展示二维码。手机扫码安装后登录同一账号，
              即可在 Web、PWA 与 App 间继续同一个项目和创作额度。
              当前仅支持安卓和鸿蒙手机，iOS 版本更新中。
            </p>
            <TutorialFigure
              src="/docs/tutorial/08-mobile-app.png"
              alt="VeyaFrame 手机 App 下载二维码弹层，展示二维码和跨设备继续项目说明"
              label="手机 App · 扫码下载"
              points={[
                '扫码下载 App 后使用与 Web 相同的邮箱账号登录。',
                '项目、任务、版本和生成结果按账号同步；本地参考图仍遵守零上传边界。',
                '手机上可以从当前项目、待办和 Agent 继续，不会重新生成一套项目事实。',
              ]}
            />
          </section>

          <section id="skills-agent" className="docs-section">
            <p className="docs-section-kicker">12 / SKILLS & AGENT</p>
            <h2>创作技能与 Agent</h2>
            <p>
              桌面端 Agent 默认收起在工作区右下角，不占用主工作面宽度；点击 Veya 图标后展开侧舱，
              再点一次或按 Esc 收起。手机端继续使用底部抽屉。
            </p>
            <p>
              创作技能是可复用的创作方法、阶段规则和验收标准。选择技能后会先显示执行计划，
              说明会读取哪些项目事实、产生什么结果，以及哪些步骤需要确认。
            </p>
            <p>
              Agent 可以读取项目状态、任务、分镜和原文，也可以提出改写、视频预算、返修、
              时间线、TTS 或成片提案。所有写入和付费动作先显示<b>待确认</b>卡片，
              Agent 不会自动创建付费任务，也不会绕过确认直接改库。
            </p>
          </section>

          <section id="cost-recovery" className="docs-section">
            <p className="docs-section-kicker">13 / COST & RECOVERY</p>
            <h2>费用、恢复与版本</h2>
            <ul className="docs-checklist">
              <li>可计费动作会先显示预估费用；批量操作还会显示预算上限。</li>
              <li>项目、任务、生成资产、时间线和渲染结果保存在服务端。</li>
              <li>刷新、切换菜单和服务重启后可查询历史任务与已完成结果。</li>
              <li>时间线草稿可编辑，确认渲染时固化为不可变版本。</li>
              <li>历史版本不会被后续编辑静默覆盖。</li>
            </ul>
          </section>

          <section id="faq" className="docs-section">
            <p className="docs-section-kicker">13 / FAQ</p>
            <h2>常见问题</h2>
            <div className="docs-faq">
              <details>
                <summary>为什么我看不到镜头视频？</summary>
                <p>需要先完成前置步骤并生成分镜。进入第 6 步后，打开“镜头视频”页签。</p>
              </details>
              <details>
                <summary>为什么视频生成按钮被禁用？</summary>
                <p>图生视频要求镜头已有已采用首帧；同时还要检查提示词、视频能力和预算配置。</p>
              </details>
              <details>
                <summary>已有小说或剧本怎么开始？</summary>
                <p>在创作技能页选择“从小说剧本开始”，或在工作台故事输入区加入项目原文。</p>
              </details>
              <details>
                <summary>想拿去即梦、可灵或剪映怎么导出？</summary>
                <p>使用项目条的导出入口选择对应平台交付包，不需要先在平台内渲染成片。</p>
              </details>
              <details>
                <summary>平台内生成的视频会自动采用吗？</summary>
                <p>不会。生成结果先进入候选，只有用户明确采用后才会成为当前镜头视频。</p>
              </details>
            </div>
          </section>

          <footer className="docs-end">
            <div>
              <p className="docs-section-kicker">READY TO START</p>
              <h2>从第一次创作开始</h2>
              <p>先载入示例查看完整链路，或直接创建自己的项目。</p>
            </div>
            <a href="/">开始第一次创作 <ArrowIcon /></a>
          </footer>
        </article>

        <aside className="docs-toc" aria-label="本页目录">
          <b>本页目录</b>
          {CHAPTERS.flatMap((chapter) => chapter.links.map(([id, label]) => (
            <a key={id} className={id === 'quick-start' ? 'active' : ''} href={`#${id}`}>
              {label}
            </a>
          )))}
        </aside>
      </main>
    </div>
  )
}
