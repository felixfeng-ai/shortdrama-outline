'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createProjectMaterial,
  createProject,
  deleteProjectMaterial,
  fetchProjectContext,
  fetchProjectMaterials,
  fetchQuota,
  listProjects,
  listSnapshots,
  type ProjectContextDto,
  type ProjectDto,
  type QuotaDto,
} from '@/lib/assets/api'
import type { ProjectMaterial } from '@/lib/assets/materials'
import {
  SKILL_CATALOG,
  filterSkillCatalog,
  type SkillCategory,
  type SkillDefinition,
  type SkillLibrary,
} from '@/lib/skills/catalog'
import {
  INTAKE_MODES,
  assessSkillReadiness,
  buildMaterialContext,
  type IntakeMode,
  type IntakeProjectState,
} from '@/lib/skills/intake'
import { listSourceMaterials } from '@/lib/skills/source-index'
import SkillAgentDrawer from './SkillAgentDrawer'

interface SeedPrompt {
  id: number
  text: string
  skill: SkillDefinition | null
}

const CATEGORIES: Array<SkillCategory | '全部'> = [
  '全部',
  '小说改编',
  '短剧开发',
  '视觉一致性',
  '分镜制作',
  '交付效率',
]

const EMPTY_PROJECT_STATE: IntakeProjectState = {
  hasIdea: false,
  materialCount: 0,
  characters: 0,
  acts: 0,
  episodes: 0,
  visuals: 0,
  scenes: 0,
  shots: 0,
}

const QUICK_PROMPTS: Record<IntakeMode, string[]> = {
  idea: [
    '把这部小说改成 12 集短剧',
    '给我三个不同方向的短剧创意',
    '估算 30 集分镜的生成成本',
  ],
  source: [
    '拆解原著，先输出人物关系与改编风险',
    '把原文整理成 12 集分集计划',
    '检查原文里最容易拍不出来的部分',
  ],
  project: [
    '现在还有哪些要处理',
    '检查镜头连续性',
    '按即梦交付规格检查当前项目',
  ],
}

function payloadCount(payload: unknown): number {
  return Array.isArray(payload) ? payload.length : payload ? 1 : 0
}

export default function SkillCatalog() {
  const [library, setLibrary] = useState<SkillLibrary>('recommend')
  const [category, setCategory] = useState<SkillCategory | '全部'>('全部')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<IntakeMode>('idea')
  const [drafts, setDrafts] = useState<Record<IntakeMode, string>>({
    idea: '',
    source: '',
    project: '',
  })
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [requestedProjectId, setRequestedProjectId] = useState<string | null>(null)
  const [quota, setQuota] = useState<QuotaDto | null>(null)
  const [agentOpen, setAgentOpen] = useState(false)
  const [seed, setSeed] = useState<SeedPrompt | null>(null)
  const [loadingProject, setLoadingProject] = useState(true)
  const [context, setContext] = useState<ProjectContextDto | null>(null)
  const [materials, setMaterials] = useState<ProjectMaterial[]>([])
  const [projectState, setProjectState] = useState<IntakeProjectState>(EMPTY_PROJECT_STATE)
  const [resourcesReady, setResourcesReady] = useState(false)
  const [materialBusy, setMaterialBusy] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [materialNotice, setMaterialNotice] = useState<string | null>(null)
  const materialInputRef = useRef<HTMLInputElement | null>(null)
  const prompt = drafts[mode]

  function setPrompt(value: string) {
    setDrafts((current) => ({ ...current, [mode]: value }))
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setRequestedProjectId(params.get('project'))
    const requestedMode = params.get('mode')
    if (requestedMode && INTAKE_MODES.some((item) => item.id === requestedMode)) {
      setMode(requestedMode as IntakeMode)
    }
    let active = true
    Promise.all([
      listProjects().catch(() => []),
      fetchQuota().catch(() => null),
    ]).then(([nextProjects, nextQuota]) => {
      if (!active) return
      setProjects(nextProjects)
      setQuota(nextQuota)
      setLoadingProject(false)
    })
    return () => {
      active = false
    }
  }, [])

  const project = (
    projects.find((item) => item.id === requestedProjectId) ??
    projects[0] ??
    null
  )
  useEffect(() => {
    setContext(null)
    setMaterials([])
    setProjectState(EMPTY_PROJECT_STATE)
    setMaterialNotice(null)
    if (!project?.id) {
      setResourcesReady(true)
      return
    }
    let active = true
    setResourcesReady(false)
    const kinds = ['idea', 'characters', 'acts', 'episodes', 'visualCharacters', 'scenes', 'visualPlaces', 'shots']
    Promise.all([
      fetchProjectMaterials(project.id, true).catch(() => []),
      fetchProjectContext(project.id).catch(() => null),
      Promise.all(kinds.map((kind) => listSnapshots<unknown>(project.id, kind).catch(() => []))),
    ]).then(([nextMaterials, nextContext, snapshots]) => {
      if (!active) return
      const latest = snapshots.map((list) => list[0]?.payload)
      const idea = latest[0] as { idea?: string } | undefined
      setMaterials(nextMaterials)
      setContext(nextContext)
      setProjectState({
        hasIdea: Boolean(idea?.idea?.trim()),
        materialCount: nextMaterials.length,
        characters: payloadCount(latest[1]),
        acts: payloadCount(latest[2]),
        episodes: payloadCount(latest[3]),
        visuals: payloadCount(latest[4]),
        scenes: payloadCount(latest[5]),
        shots: payloadCount(latest[7]),
      })
      setResourcesReady(true)
    })
    return () => {
      active = false
    }
  }, [project?.id])

  const skills = useMemo(
    () => filterSkillCatalog({ library, category, query }),
    [category, library, query],
  )
  const selectedSkill = SKILL_CATALOG.find((skill) => skill.id === selectedId) ?? null
  const closeAgent = useCallback(() => setAgentOpen(false), [])
  const consumeSeed = useCallback(() => setSeed(null), [])
  const modeDefinition = INTAKE_MODES.find((item) => item.id === mode) ?? INTAKE_MODES[0]
  const materialCharacters = materials.reduce((sum, material) => sum + material.characterCount, 0)
  const readiness = selectedSkill
    ? assessSkillReadiness(selectedSkill.id, {
      ...projectState,
      materialCount: materials.length,
    })
    : null
  const intentSummary = [
    context?.brief.emotion,
    context?.brief.audience,
    context?.brief.references,
    context?.brief.redline ? `避开 ${context.brief.redline}` : '',
  ].filter(Boolean).join(' · ')
  const agentContextBlock = [
    `当前项目：${project?.title || '尚未选择项目'}`,
    `当前集数：${context?.episodeCount ?? projectState.episodes}`,
    intentSummary ? `创作意图：${intentSummary}` : '',
    materials.length > 0
      ? [
        `当前项目原文目录：\n${listSourceMaterials(materials)}`,
        `本轮预读（不是完整原文，后续必须按需调用 read_source_chunk）：\n${buildMaterialContext(materials, 6_000)}`,
      ].join('\n\n')
      : '',
  ].filter(Boolean).join('\n')

  function chooseSkill(skill: SkillDefinition) {
    if (selectedId === skill.id) {
      setSelectedId(null)
      return
    }
    setSelectedId(skill.id)
    setPrompt(skill.prompt)
    requestAnimationFrame(() => {
      document.getElementById('skill-prompt')?.focus()
    })
  }

  function switchMode(next: IntakeMode) {
    setMode(next)
    setSelectedId(null)
    const url = new URL(window.location.href)
    if (next === 'idea') url.searchParams.delete('mode')
    else url.searchParams.set('mode', next)
    window.history.replaceState(null, '', url)
    requestAnimationFrame(() => document.getElementById('skill-prompt')?.focus())
  }

  function openAgentWithPrompt(text: string, skill: SkillDefinition | null = selectedSkill) {
    const raw = text.trim()
    const mainText = mode === 'source' && raw.length > 12_000
      ? `${Array.from(raw).slice(0, 12_000).join('')}\n（输入原文超出本轮预算，已截断）`
      : raw
    const clean = [
      mainText,
    ].filter(Boolean).join('\n\n')
    if (!clean) return
    setSeed({ id: Date.now(), text: clean, skill })
    setAgentOpen(true)
  }

  async function saveTextMaterial(name: string, content: string, mime = 'text/plain', bytes?: number) {
    if (!project?.id) throw new Error('请先选择或创建项目')
    const material = await createProjectMaterial(project.id, {
      name,
      content,
      mime,
      bytes,
    })
    if (!material.deduped) {
      setProjectState((state) => ({ ...state, materialCount: state.materialCount + 1 }))
    }
    setMaterials((current) => {
      const next = [material, ...current.filter((item) => item.id !== material.id)]
      return next
    })
    setMaterialNotice(
      material.deduped
        ? `已识别重复原文：${material.name}`
        : `已读取 ${material.characterCount.toLocaleString('zh-CN')} 字：${material.name}`,
    )
    return material
  }

  async function importSourceFiles(files: FileList | null) {
    const list = Array.from(files ?? [])
    if (list.length === 0) return
    setMaterialBusy(true)
    setMaterialNotice(null)
    try {
      for (const file of list) {
        if (!/\.(txt|md)$/i.test(file.name) && file.type !== 'text/plain' && file.type !== 'text/markdown') {
          setMaterialNotice(`${file.name} 暂不支持；当前可读取 TXT / Markdown`)
          continue
        }
        if (file.size > 2 * 1024 * 1024) {
          setMaterialNotice(`${file.name} 超过 2 MB，请拆分后再加入`)
          continue
        }
        const content = await file.text()
        if (!content.trim()) {
          setMaterialNotice(`${file.name} 没有可读取的文字`)
          continue
        }
        await saveTextMaterial(file.name, content, file.type || 'text/plain', file.size)
      }
    } catch (error) {
      setMaterialNotice(error instanceof Error ? error.message : '原文读取失败，请重试')
    } finally {
      setMaterialBusy(false)
      if (materialInputRef.current) materialInputRef.current.value = ''
    }
  }

  async function saveDraftAsMaterial() {
    const content = prompt.trim()
    if (!content || materialBusy) return
    setMaterialBusy(true)
    setMaterialNotice(null)
    try {
      await saveTextMaterial(
        `粘贴原文 · ${new Date().toLocaleString('zh-CN', { hour12: false })}.txt`,
        content,
        'text/plain',
      )
      setPrompt('请读取刚加入项目的原文，先输出人物、场景与改编风险。')
    } catch (error) {
      setMaterialNotice(error instanceof Error ? error.message : '原文保存失败，请重试')
    } finally {
      setMaterialBusy(false)
    }
  }

  async function removeMaterial(material: ProjectMaterial) {
    if (!project?.id) return
    if (!window.confirm(`从当前项目移除「${material.name}」？`)) return
    setMaterialBusy(true)
    try {
      await deleteProjectMaterial(project.id, material.id)
      setMaterials((current) => current.filter((item) => item.id !== material.id))
      setProjectState((state) => ({
        ...state,
        materialCount: Math.max(0, state.materialCount - 1),
      }))
      setMaterialNotice(`已移除 ${material.name}`)
    } catch (error) {
      setMaterialNotice(error instanceof Error ? error.message : '移除失败，请重试')
    } finally {
      setMaterialBusy(false)
    }
  }

  async function createNewProject() {
    if (creatingProject) return
    setCreatingProject(true)
    setMaterialNotice(null)
    try {
      const data = await createProject('未命名项目')
      setProjects((current) => [data.project, ...current])
      setRequestedProjectId(data.project.id)
      const url = new URL(window.location.href)
      url.searchParams.set('project', data.project.id)
      window.history.replaceState(null, '', url)
    } catch (error) {
      setMaterialNotice(error instanceof Error ? error.message : '项目创建失败，请重试')
    } finally {
      setCreatingProject(false)
    }
  }

  return (
    <div className="skill-page">
      <header className="topbar">
        <div className="brand"><b>成剧</b><span>VEYAFRAME</span><span className="ai">AI</span></div>
        <nav className="top-nav" aria-label="主导航">
          <a href={project ? `/skills?project=${encodeURIComponent(project.id)}` : '/skills'} className="active">Skill</a>
          <a href={project ? `/?project=${encodeURIComponent(project.id)}&step=shots` : '/'}>项目</a>
          <a href={project ? `/?project=${encodeURIComponent(project.id)}&step=shots` : '/?step=shots'}>画布</a>
        </nav>
        <span className="top-spacer" />
        <div className="top-meta">
          <span className="top-project">{project?.title || (loadingProject ? '读取项目中…' : '还没有项目')}</span>
          <span>{quota ? `额度 ${quota.remaining} / ${quota.limit}` : '额度读取中'}</span>
          <span>{projects.length} 个项目</span>
        </div>
        <div className="top-actions">
          <a className="icon-button" href="/" aria-label="返回项目工作台">
            <svg viewBox="0 0 24 24"><path d="M4 12 12 4l8 8M6.5 10v9h11v-9" /></svg>
          </a>
        </div>
      </header>

      <main className="page">
        <section className="hero" aria-labelledby="pageTitle">
          <p className="hero-kicker">CREATIVE WORKFLOWS</p>
          <h1 id="pageTitle">
            <span>Skill</span>
            <span className="title-separator" aria-hidden="true">·</span>
            你的短剧创作入口
          </h1>
          <p>从一句想法、已有原文或当前项目开始。发送前先看清会读取什么、产出什么。</p>

          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault()
              openAgentWithPrompt(prompt)
            }}
          >
            <div className="intake-modes" role="group" aria-label="创作起点">
              {INTAKE_MODES.map((item) => (
                <button
                  key={item.id}
                  className={`intake-mode ${mode === item.id ? 'active' : ''}`}
                  type="button"
                  aria-pressed={mode === item.id}
                  onClick={() => switchMode(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="skill-prompt">输入你的创作灵感或任务</label>
            <textarea
              id="skill-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder={modeDefinition.placeholder}
              maxLength={mode === 'source' ? 200_000 : undefined}
            />
            <p className="intake-mode-hint">{modeDefinition.hint}</p>
            {mode === 'source' && (
              <p className="source-consent">
                原文会保存到当前项目，供改编和场记按需读取。请勿提交无权使用的作品。
              </p>
            )}
            <div className="composer-toolbar">
              <button
                className="tool-button"
                type="button"
                aria-label="添加项目原文"
                disabled={!project || materialBusy}
                onClick={() => materialInputRef.current?.click()}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3.5h7l3 3V16.5H5z" /><path d="M12 3.5v3h3M7.5 9h5M7.5 12h5" /></svg>
                <span>原文{materials.length > 0 ? ` ${materials.length}` : ''}</span>
              </button>
              {mode === 'source' && (
                <button
                  className="tool-button source-save"
                  type="button"
                  aria-label="把当前草稿加入项目原文"
                  disabled={!prompt.trim() || materialBusy || !project}
                  onClick={() => { void saveDraftAsMaterial() }}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V4M5 9l5-5 5 5" /><path d="M4 15.5v1h12v-1" /></svg>
                  <span>{materialBusy ? '读取中…' : '加入项目原文'}</span>
                </button>
              )}
              <button
                className="tool-button"
                type="button"
                aria-label="打开项目资产"
                onClick={() => { window.location.href = project ? `/?project=${encodeURIComponent(project.id)}&step=visuals` : '/' }}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H16v14H6.5A2.5 2.5 0 0 1 4 14.5v-9Z" /><path d="M4 14.5A2.5 2.5 0 0 1 6.5 12H16" /></svg>
                <span>项目资产</span>
              </button>
              <button
                className="tool-button"
                type="button"
                aria-label="选择 Skill"
                onClick={() => document.getElementById('skill-catalog')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2.8 2 4.3 4.7.5-3.5 3.2 1 4.6-4.2-2.3-4.2 2.3 1-4.6-3.5-3.2 4.7-.5 2-4.3Z" /></svg>
                <span>选择 Skill</span>
              </button>
              {selectedSkill && (
                <span className="selected-skill visible">
                  <span>{selectedSkill.title}</span>
                  <button type="button" aria-label="取消选择技能" onClick={() => setSelectedId(null)}>×</button>
                </span>
              )}
              <button
                className="send-button"
                type="submit"
                aria-label="发送"
                disabled={!project || !prompt.trim() || materialBusy}
              >
                <svg viewBox="0 0 20 20"><path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" /></svg>
              </button>
            </div>
            <input
              ref={materialInputRef}
              id="localMaterialInput"
              className="sr-only"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              multiple
              disabled={!project || materialBusy}
              onChange={(event) => { void importSourceFiles(event.target.files) }}
            />
            {materials.length > 0 && (
              <div className="project-materials">
                <div className="project-materials-head">
                  <span>项目原文</span>
                  <small>{materials.length} 份 · {materialCharacters.toLocaleString('zh-CN')} 字</small>
                </div>
                {materials.map((material) => (
                  <div key={material.id} className="project-material-row">
                    <span className="material-type">{material.kind === 'script' ? '剧本' : material.kind === 'novel' ? '小说' : '资料'}</span>
                    <span className="material-copy">
                      <b title={material.name}>{material.name}</b>
                      <small>
                        {material.characterCount.toLocaleString('zh-CN')} 字
                        {material.truncated ? ' · 已截断' : ''}
                      </small>
                    </span>
                    <button
                      type="button"
                      aria-label={`移除原文 ${material.name}`}
                      disabled={materialBusy}
                      onClick={() => { void removeMaterial(material) }}
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
            {materialNotice && (
              <p className="material-notice" role="status" aria-live="polite">{materialNotice}</p>
            )}
          </form>

          <div className="intake-preflight" aria-live="polite">
            <div>
              <span>本次读取</span>
              <b>{project?.title || (loadingProject ? '正在读取项目…' : '尚未选择项目')}</b>
              <small>
                {context?.episodeCount ?? projectState.episodes ?? 0} 集
                {' · '}
                {materials.length} 份原文
                {intentSummary ? ` · ${intentSummary}` : ' · 意图尚未设置'}
              </small>
              {!project && !loadingProject && (
                <button
                  className="create-project-inline"
                  type="button"
                  disabled={creatingProject}
                  onClick={() => { void createNewProject() }}
                >
                  {creatingProject ? '创建中…' : '新建项目'}
                </button>
              )}
            </div>
            <div className={readiness && !readiness.ready ? 'needs-input' : ''}>
              <span>Skill 前置</span>
              <b>{selectedSkill ? selectedSkill.title : '场记自动匹配'}</b>
              <small>
                {!selectedSkill
                  ? '发送后先判断适合的 Skill'
                  : !resourcesReady
                    ? '正在核对项目状态…'
                    : readiness?.ready
                      ? '前置已满足'
                      : `还缺 ${readiness?.missing.join('、')}`}
              </small>
            </div>
            <div>
              <span>预期产出</span>
              <b>{selectedSkill ? selectedSkill.produces.join(' · ') : '下一步计划'}</b>
              <small>{selectedSkill ? selectedSkill.writePolicy : '写入项目前继续确认'}</small>
            </div>
          </div>

          <div className="quick-prompts" aria-label="快捷任务">
            {QUICK_PROMPTS[mode].map((prompt) => (
              <button key={prompt} type="button" onClick={() => setPrompt(prompt)}>{prompt}</button>
            ))}
          </div>
        </section>

        <section id="skill-catalog" className="catalog" aria-labelledby="catalogTitle">
          <div className="catalog-head">
            <h2 id="catalogTitle" className="catalog-title">Skill</h2>
            <div className="library-tabs" role="tablist" aria-label="技能集合">
              {([
                ['recommend', '推荐'],
                ['favorite', '收藏'],
                ['mine', '我的'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={`library-tab ${library === value ? 'active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={library === value}
                  onClick={() => setLibrary(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="catalog-search">
              <span className="sr-only">搜索 Skill</span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="4.5" /><path d="m12 12 4 4" /></svg>
              <input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="搜索 Skill" />
            </label>
          </div>
          <div className="catalog-filters" aria-label="Skill 分类">
            {CATEGORIES.map((item) => (
              <button
                key={item}
                className={`filter-button ${category === item ? 'active' : ''}`}
                type="button"
                data-category={item}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="skill-grid">
            {skills.map((skill) => (
              <button
                key={skill.id}
                className={`skill-card ${skill.visual} ${skill.id === selectedId ? 'selected' : ''}`}
                type="button"
                aria-pressed={skill.id === selectedId}
                onClick={() => chooseSkill(skill)}
              >
                <span className="skill-visual">
                  {/* Existing generated project asset used as a real production thumbnail. */}
                  <img src={skill.image} alt="" loading="lazy" />
                  <span className="visual-badge">{skill.type}</span>
                  <span className="visual-count">{skill.count}</span>
                </span>
                <span className="skill-content">
                  <h3>{skill.title}</h3>
                  <p>{skill.summary}</p>
                  <span className="skill-meta">
                    <span className="official-mark">V</span>
                    <b>官方 Skill</b><i />
                    <span>{skill.meta}</span>
                  </span>
                </span>
                <span className="skill-arrow">›</span>
              </button>
            ))}
          </div>
          {skills.length === 0 && <div className="catalog-empty" style={{ display: 'block' }}>当前集合还没有内容，或没有匹配的 Skill。</div>}
          <footer className="library-footer">
            <span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3 3.5 6v4c0 4 2.7 6.2 6.5 7 3.8-.8 6.5-3 6.5-7V6L10 3Z" /><path d="m7.5 10 1.7 1.7 3.5-3.7" /></svg>
              官方 Skill 经过版本与权限审核，正文只在场记运行时按需加载
            </span>
            <span>Skill 入口 · 写入前需要确认</span>
          </footer>
          <nav className="legal-links" aria-label="内测合规说明">
            <a href="/legal">隐私、条款与内容规则</a>
            <a href="/report">举报内容</a>
          </nav>
        </section>
      </main>

      <button
        className="agent-entry"
        type="button"
        aria-expanded={agentOpen}
        aria-controls="agentDrawer"
        onClick={() => setAgentOpen(true)}
      >
        <span className="agent-avatar">记</span>
        <span className="agent-entry-copy"><b>问场记</b><span>选技能、查项目或直接开工</span></span>
        <i aria-hidden="true" />
      </button>

      <SkillAgentDrawer
        open={agentOpen}
        onClose={closeAgent}
        projectId={project?.id ?? null}
        projectTitle={project?.title ?? ''}
        projectContextBlock={agentContextBlock}
        sourceMaterials={materials}
        selectedSkill={selectedSkill}
        seedPrompt={seed}
        onConsumedSeed={consumeSeed}
      />
    </div>
  )
}
