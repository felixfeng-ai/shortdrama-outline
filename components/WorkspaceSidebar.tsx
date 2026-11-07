'use client'

import { useState } from 'react'

import type { ProjectBulkDeleteScope, ProjectDto } from '@/lib/assets/api'
import type { WorkspaceMode } from '@/lib/app-nav'
import type { StepKey } from '@/lib/types'
import { orderWorkspaceSteps, workspaceStepLabel } from '@/lib/workspace-view'
import AuthButton from './AuthButton'
import QuotaBar from './QuotaBar'
import VeyaBrandMark from './VeyaBrandMark'

interface Props {
  mode: WorkspaceMode
  currentStep: StepKey
  completed: Record<StepKey, boolean>
  homeActive: boolean
  projects: ProjectDto[]
  projectId: string | null
  projectTitle: string
  todoCount: number
  quotaRefreshKey: number
  episodeCount: number
  mobileOpen: boolean
  onCloseMobile: () => void
  onHome: () => void
  onSwitchProject: (id: string) => void
  onDeleteProject: (id: string) => Promise<boolean>
  onBulkDeleteProjects: (scope: ProjectBulkDeleteScope) => Promise<boolean>
  onNewProject: () => void
  onOpenTodo: () => void
  onOpenCreate: () => void
  onOpenAssets: () => void
  onOpenStep: (step: StepKey) => void
  onOpenCanvas: () => void
  onOpenArtifacts: () => void
  onOpenLedger: () => void
}

const WORKSPACE_ICONS = {
  home: <><path d="m4 11 8-7 8 7v9H4z" /><path d="M9 20v-6h6v6" /></>,
  projects: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9h8M8 13h5" /></>,
  todo: <><path d="M5 5h14v14H5z" /><path d="m8 12 2.5 2.5L16 9" /></>,
  skills: <><path d="m12 3 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" /><path d="m19 16 1 2 2 1-2 1-1 2-1-2-2-1 2-1z" /></>,
  assets: <><path d="M4 8h16v11H4z" /><path d="M8 8V5h8v3M4 12h16" /></>,
  docs: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21.5v-16Z" /></>,
  canvas: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M8 6h8M7 8l4 8M17 8l-4 8" /></>,
  artifacts: <><path d="m12 3 8 5-8 5-8-5z" /><path d="m4 13 8 5 8-5" /></>,
  ledger: <><path d="M5 4h14v16H5z" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
}

function NavIcon({ children }: { children: React.ReactNode }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
}

export default function WorkspaceSidebar({
  mode,
  currentStep,
  completed,
  homeActive,
  projects,
  projectId,
  projectTitle,
  todoCount,
  quotaRefreshKey,
  episodeCount,
  mobileOpen,
  onCloseMobile,
  onHome,
  onSwitchProject,
  onDeleteProject,
  onBulkDeleteProjects,
  onNewProject,
  onOpenTodo,
  onOpenCreate,
  onOpenAssets,
  onOpenStep,
  onOpenCanvas,
  onOpenArtifacts,
  onOpenLedger,
}: Props) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [confirmingProjectId, setConfirmingProjectId] = useState<string | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState<ProjectBulkDeleteScope | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const orderedSteps = orderWorkspaceSteps(
    ['characters', 'acts', 'episodes', 'visuals', 'scenes', 'shots'],
    currentStep,
  )
  const sampleCount = projects.filter((project) => project.title.startsWith('示例 · ')).length

  function closeAnd(action: () => void) {
    action()
    onCloseMobile()
  }

  return (
    <>
      <button
        type="button"
        className={`wfx-mobile-scrim ${mobileOpen ? 'is-open' : ''}`}
        aria-label="关闭侧栏"
        onClick={onCloseMobile}
      />
      <aside className={`wfx-side ${mobileOpen ? 'is-open' : ''}`} aria-label="工作区导航">
        <a className="wfx-brand" href="#" onClick={(event) => { event.preventDefault(); closeAnd(onHome) }}>
          <span className="wfx-brand-mark"><VeyaBrandMark /></span>
          <b>VeyaFrame</b>
          <small>成剧</small>
        </a>

        <button
          className="wfx-workspace-switcher"
          type="button"
          aria-expanded={projectMenuOpen}
          onClick={() => setProjectMenuOpen((open) => !open)}
        >
          <span><b>我的创作空间</b><small>个人工作区</small></span>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4" /></svg>
        </button>

        {projectMenuOpen && (
          <div className="wfx-project-menu" aria-label="项目列表">
            {projects.length === 0 ? (
              <p className="wfx-project-empty">还没有项目</p>
            ) : (
              <div className="wfx-project-list-scroll">
                {projects.map((project) => {
                  const isActive = project.id === projectId
                  const isConfirming = project.id === confirmingProjectId
                  return (
                    <div
                      key={project.id}
                      className={`wfx-project-menu-row ${isActive ? 'is-active' : ''} ${isConfirming ? 'is-confirming' : ''}`}
                    >
                      {isConfirming ? (
                        <div className="wfx-project-delete-confirm" role="alert">
                          <span>删除后无法恢复</span>
                          <button
                            type="button"
                            className="is-confirm"
                            disabled={deletingProjectId === project.id}
                            onClick={() => {
                              setDeletingProjectId(project.id)
                              void onDeleteProject(project.id).then((deleted) => {
                                setDeletingProjectId(null)
                                if (!deleted) return
                                setConfirmingProjectId(null)
                                if (project.id === projectId) setProjectMenuOpen(false)
                              })
                            }}
                          >
                            {deletingProjectId === project.id ? '删除中…' : '确认删除'}
                          </button>
                          <button
                            type="button"
                            disabled={deletingProjectId === project.id}
                            onClick={() => setConfirmingProjectId(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="wfx-project-select"
                            onClick={() => {
                              onSwitchProject(project.id)
                              setProjectMenuOpen(false)
                              setConfirmingProjectId(null)
                              onCloseMobile()
                            }}
                          >
                            <span>{project.title}</span>
                            {isActive && <small>当前</small>}
                          </button>
                          <button
                            type="button"
                            className="wfx-project-delete"
                            aria-label={`删除项目 ${project.title}`}
                            title="删除项目"
                            onClick={() => setConfirmingProjectId(project.id)}
                          >
                            <svg viewBox="0 0 20 20" aria-hidden="true">
                              <path d="M4.5 6h11M8 3.8h4M6.5 6l.6 9.2h5.8l.6-9.2M8.5 9v3.5M11.5 9v3.5" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div className="wfx-project-menu-footer">
              {bulkConfirm ? (
                <div className="wfx-project-bulk-confirm" role="alert">
                  <p>
                    {bulkConfirm === 'duplicate-samples'
                      ? `将清理 ${Math.max(0, sampleCount - 1)} 个较旧示例，保留最近一份。`
                      : `将删除当前账号的全部 ${projects.length} 个项目，无法恢复。`}
                  </p>
                  <div>
                    <button
                      type="button"
                      className="is-confirm"
                      disabled={bulkDeleting}
                      onClick={() => {
                        setBulkDeleting(true)
                        void onBulkDeleteProjects(bulkConfirm).then((deleted) => {
                          setBulkDeleting(false)
                          if (!deleted) return
                          setBulkConfirm(null)
                          setProjectMenuOpen(false)
                          onCloseMobile()
                        })
                      }}
                    >
                      {bulkDeleting ? '清理中…' : '确认清理'}
                    </button>
                    <button
                      type="button"
                      disabled={bulkDeleting}
                      onClick={() => setBulkConfirm(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {sampleCount > 1 && (
                    <button
                      type="button"
                      className="wfx-project-bulk-action"
                      onClick={() => setBulkConfirm('duplicate-samples')}
                    >
                      清理重复示例 <small>{sampleCount - 1}</small>
                    </button>
                  )}
                  {projects.length > 0 && (
                    <button
                      type="button"
                      className="wfx-project-bulk-action is-danger"
                      onClick={() => setBulkConfirm('all')}
                    >
                      删除全部项目
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                className="wfx-project-new"
                onClick={() => {
                  onNewProject()
                  setProjectMenuOpen(false)
                  setConfirmingProjectId(null)
                  setBulkConfirm(null)
                  onCloseMobile()
                }}
              >
                + 新建项目
              </button>
            </div>
          </div>
        )}

        <div className="wfx-side-scroll">
          <nav aria-label="工作区">
            <div className="wfx-nav-group">
              <span className="wfx-nav-label">工作区</span>
              <button
                className={`wfx-nav-item ${homeActive ? 'is-active' : ''}`}
                type="button"
                onClick={() => closeAnd(onHome)}
              >
                <NavIcon>{WORKSPACE_ICONS.home}</NavIcon><span>首页</span>
              </button>
              <button
                className="wfx-nav-item"
                type="button"
                onClick={() => setProjectMenuOpen((open) => !open)}
              >
                <NavIcon>{WORKSPACE_ICONS.projects}</NavIcon><span>我的项目</span>
              </button>
              <button className="wfx-nav-item" type="button" onClick={() => closeAnd(onOpenTodo)}>
                <NavIcon>{WORKSPACE_ICONS.todo}</NavIcon><span>项目待办</span>
                {todoCount > 0 && <i className="wfx-count">{todoCount}</i>}
              </button>
              <button
                className={`wfx-nav-item ${mode === 'create' ? 'is-active' : ''}`}
                type="button"
                onClick={() => closeAnd(onOpenCreate)}
              >
                <NavIcon>{WORKSPACE_ICONS.skills}</NavIcon><span>创作技能</span>
              </button>
              <button className="wfx-nav-item" type="button" onClick={() => closeAnd(onOpenAssets)}>
                <NavIcon>{WORKSPACE_ICONS.assets}</NavIcon><span>资产库</span>
              </button>
              <a className="wfx-nav-item wfx-docs-entry" href="/docs" onClick={onCloseMobile}>
                <NavIcon>{WORKSPACE_ICONS.docs}</NavIcon><span>使用教程</span>
              </a>
            </div>
          </nav>

          <nav aria-label="当前项目步骤">
            <div className="wfx-nav-group">
              <span className="wfx-nav-label">{projectTitle}</span>
              {orderedSteps.map((step) => {
                const isCurrent = step === currentStep
                return (
                  <button
                    key={step}
                    className={`wfx-nav-item wfx-project-step ${isCurrent ? 'is-current' : ''} ${completed[step] ? 'is-done' : ''}`}
                    type="button"
                    aria-current={isCurrent ? 'step' : undefined}
                    onClick={() => closeAnd(() => onOpenStep(step))}
                  >
                    <i className="wfx-step-state" />
                    <span>{workspaceStepLabel(step)}</span>
                  </button>
                )
              })}
            </div>
          </nav>

          <nav aria-label="项目工具">
            <div className="wfx-nav-group">
              <span className="wfx-nav-label">项目工具</span>
              <button
                className={`wfx-nav-item ${mode === 'canvas' ? 'is-active' : ''}`}
                type="button"
                onClick={() => closeAnd(onOpenCanvas)}
              >
                <NavIcon>{WORKSPACE_ICONS.canvas}</NavIcon><span>编排画布</span>
              </button>
              <button className="wfx-nav-item" type="button" onClick={() => closeAnd(onOpenArtifacts)}>
                <NavIcon>{WORKSPACE_ICONS.artifacts}</NavIcon><span>产物中心</span>
              </button>
              <button className="wfx-nav-item" type="button" onClick={() => closeAnd(onOpenLedger)}>
                <NavIcon>{WORKSPACE_ICONS.ledger}</NavIcon><span>生产台账</span>
              </button>
            </div>
          </nav>
        </div>

        <div className="wfx-side-user">
          <AuthButton variant="workspace-user" />
          <QuotaBar refreshKey={quotaRefreshKey} episodeCount={episodeCount} inline />
        </div>
      </aside>
    </>
  )
}
