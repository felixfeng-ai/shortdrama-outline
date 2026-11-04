'use client'

import { useCallback, useState } from 'react'

import type { AppTab } from '@/lib/app-nav'
import type { AgentCard, AgentState } from '@/lib/agent/tools'
import type { ProjectDto } from '@/lib/assets/api'
import type { Shot, VisualCharacter } from '@/lib/assets/types'
import type { LookBook } from '@/lib/look'
import type { StepKey } from '@/lib/types'
import type { TodoItem } from '@/lib/todo'
import type { GenerationTask } from '@/lib/generation/types'
import AgentDock from './AgentDock'
import GenerationTaskPanel from './GenerationTaskPanel'
import MobileReviewPanel from './MobileReviewPanel'
import PwaInstallButton from './PwaInstallButton'
import QuotaBar from './QuotaBar'
import TaskNotificationControl from './TaskNotificationControl'
import { useTaskNotifications } from './useTaskNotifications'

interface Props {
  tab: AppTab
  projects: ProjectDto[]
  currentId: string | null
  hasContent: boolean
  completed: Record<StepKey, boolean>
  currentStep: string
  todoItems: TodoItem[]
  projectId: string | null
  visuals: VisualCharacter[]
  shots: Shot[]
  look: LookBook
  agentState: AgentState
  quotaRefreshKey: number
  episodeCount: number
  seedPrompt: { id: number; text: string } | null
  onTabChange: (tab: AppTab) => void
  onOpenWorkbench: () => void
  onOpenStep: (step: StepKey) => void
  onSwitchProject: (id: string) => void
  onNewProject: () => void
  onLoadSample: () => void
  onApplyCard: (card: Extract<AgentCard, { kind: 'shot-edit' }>) => void
  onRegenerate: (step: StepKey) => void
}

const TABS: { key: AppTab; label: string; icon: JSX.Element }[] = [
  {
    key: 'agent',
    label: 'Agent',
    icon: (
      <>
        <path d="M5 8.5h14v9H5z" />
        <path d="M12 8.5V4.5M9.5 4.5h5" />
        <circle cx="9.5" cy="13" r=".8" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="13" r=".8" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    key: 'projects',
    label: '项目',
    icon: (
      <>
        <path d="M3.5 7.5h6l1.8 2H20v9H3.5z" />
        <path d="M3.5 7.5v-2h6l1.8 2" />
      </>
    ),
  },
  {
    key: 'tasks',
    label: '任务',
    icon: (
      <>
        <path d="M5 4.5h14v15H5z" />
        <path d="M8 9h8M8 12.5h8M8 16h5" />
      </>
    ),
  },
  {
    key: 'me',
    label: '我的',
    icon: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M4.5 20c.7-4 3.2-6 7.5-6s6.8 2 7.5 6" />
      </>
    ),
  },
]

function when(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

export default function MobileAppShell({
  tab,
  projects,
  currentId,
  hasContent,
  completed,
  currentStep,
  todoItems,
  projectId,
  visuals,
  shots,
  look,
  agentState,
  quotaRefreshKey,
  episodeCount,
  seedPrompt,
  onTabChange,
  onOpenWorkbench,
  onOpenStep,
  onSwitchProject,
  onNewProject,
  onLoadSample,
  onApplyCard,
  onRegenerate,
}: Props) {
  const current = projects.find((project) => project.id === currentId) ?? null
  const title = current?.title ?? (hasContent ? '未保存的新项目' : '还没有项目')
  const completedCount = Object.values(completed).filter(Boolean).length
  const nextTodo = todoItems[0] ?? null
  const [taskSnapshot, setTaskSnapshot] = useState<{
    projectId: string | null
    tasks: GenerationTask[]
  }>({ projectId: null, tasks: [] })
  const handleTasksChange = useCallback((tasks: GenerationTask[]) => {
    setTaskSnapshot({ projectId, tasks })
  }, [projectId])
  const taskList = taskSnapshot.projectId === projectId ? taskSnapshot.tasks : []
  const taskUnread = useTaskNotifications(projectId, taskList, tab === 'tasks')

  return (
    <div className="mobile-app-shell">
      <header className="mobile-app-top">
        <div className="mobile-app-brand" aria-label="成剧 VeyaFrame App">
          <span aria-hidden="true">V</span>
          <div>
            <b>成剧</b>
            <small>VEYAFRAME APP</small>
          </div>
        </div>
        <button
          type="button"
          className="mobile-app-workspace"
          onClick={onOpenWorkbench}
          aria-label="进入六步工作台"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4" y="4" width="7" height="7" rx="1" />
            <rect x="13" y="4" width="7" height="7" rx="1" />
            <rect x="4" y="13" width="7" height="7" rx="1" />
            <rect x="13" y="13" width="7" height="7" rx="1" />
          </svg>
          <span>工作台</span>
        </button>
      </header>

      <main className="mobile-app-main">
        <section
          className="mobile-app-pane mobile-app-agent"
          aria-labelledby="app-pane-agent"
          hidden={tab !== 'agent'}
        >
          <div className="mobile-app-hero">
            <div className="mobile-app-hero-head">
              <div>
                <p>当前项目</p>
                <h2 id="app-pane-agent">{title}</h2>
              </div>
              <span>{completedCount}/6</span>
            </div>
            <div className="mobile-app-progress" aria-label={`六步完成 ${completedCount} 步`}>
              <i style={{ width: `${(completedCount / 6) * 100}%` }} />
            </div>
            <dl className="mobile-app-facts">
              <div><dt>当前</dt><dd>{currentStep}</dd></div>
              <div><dt>待办</dt><dd>{todoItems.length} 项</dd></div>
              <div><dt>分镜</dt><dd>{shots.length}</dd></div>
            </dl>
            {nextTodo && (
              <button
                type="button"
                className="mobile-app-next"
                onClick={() => onOpenStep(nextTodo.step)}
              >
                <span>{nextTodo.kind === 'next' ? '下一步' : '待处理'}</span>
                <b>{nextTodo.text}</b>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m7 4 6 6-6 6" />
                </svg>
              </button>
            )}
          </div>
          <div className="mobile-app-agent-dock">
            <AgentDock
              variant="docked"
              state={agentState}
              open
              onOpenChange={() => {}}
              context={`${currentStep} · ${title}`}
              onApplyCard={onApplyCard}
              onRegenerate={onRegenerate}
              onOpenStep={onOpenStep}
              seedPrompt={seedPrompt}
            />
          </div>
        </section>

        <section
          className="mobile-app-pane mobile-app-section"
          aria-labelledby="app-pane-projects"
          hidden={tab !== 'projects'}
        >
          <div className="mobile-app-section-head">
            <div>
              <p>PROJECTS</p>
              <h2 id="app-pane-projects">项目</h2>
            </div>
            <span>{projects.length} 个</span>
          </div>

          <button type="button" className="mobile-app-current-project" onClick={onOpenWorkbench}>
            <span>当前项目</span>
            <strong>{title}</strong>
            <small>{completedCount}/6 步 · {currentStep}</small>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7 4 6 6-6 6" /></svg>
          </button>

          <div className="mobile-app-project-list" aria-label="项目列表">
            {projects.length === 0 ? (
              <div className="mobile-app-empty">
                <b>还没有项目</b>
                <p>写下故事灵感后，项目会出现在这里。</p>
              </div>
            ) : projects.map((project) => {
              const active = project.id === currentId
              return (
                <button
                  key={project.id}
                  type="button"
                  className={active ? 'is-current' : ''}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSwitchProject(project.id)}
                >
                  <span className="mobile-app-project-mark" aria-hidden="true">
                    {project.title.trim().slice(0, 1) || '剧'}
                  </span>
                  <span className="mobile-app-project-copy">
                    <b>{project.title}</b>
                    <small>{active ? '当前项目' : when(project.updatedAt)}</small>
                  </span>
                  <span className="mobile-app-project-state">{active ? '继续' : '打开'}</span>
                </button>
              )
            })}
          </div>

          <div className="mobile-app-actions">
            <button type="button" onClick={onNewProject}>新建项目</button>
            <button type="button" onClick={onLoadSample}>载入示例</button>
            <button type="button" className="primary" onClick={onOpenWorkbench}>进入工作台</button>
          </div>
        </section>

        <section
          className="mobile-app-pane mobile-app-section"
          aria-labelledby="app-pane-tasks"
          hidden={tab !== 'tasks'}
        >
          <div className="mobile-app-section-head">
            <div>
              <p>GENERATION</p>
              <h2 id="app-pane-tasks">任务</h2>
            </div>
            <span>{title}</span>
          </div>
          <MobileReviewPanel projectId={projectId} visuals={visuals} shots={shots} />
          <GenerationTaskPanel
            projectId={projectId}
            visuals={visuals}
            shots={shots}
            look={look}
            onTasksChange={handleTasksChange}
            empty={(
              <div className="mobile-app-task-empty">
                <b>{projectId ? '暂无生成任务' : '还没有项目'}</b>
              </div>
            )}
          />
        </section>

        <section
          className="mobile-app-pane mobile-app-section"
          aria-labelledby="app-pane-me"
          hidden={tab !== 'me'}
        >
          <div className="mobile-app-section-head">
            <div>
              <p>ACCOUNT</p>
              <h2 id="app-pane-me">我的</h2>
            </div>
            <span>本机会话</span>
          </div>
          <div className="mobile-app-account">
            <span aria-hidden="true">V</span>
            <div>
              <b>匿名创作会话</b>
              <p>项目与快捷设置仅绑定当前浏览器。</p>
            </div>
          </div>
          <QuotaBar refreshKey={quotaRefreshKey} episodeCount={episodeCount} />
          <TaskNotificationControl />
          <div className="mobile-app-install"><PwaInstallButton /></div>
          <dl className="mobile-app-settings">
            <div><dt>项目归档</dt><dd>从工作台导出项目包</dd></div>
            <div><dt>图片边界</dt><dd>本地图库原图不随请求上传</dd></div>
            <div><dt>跨设备同步</dt><dd>后续版本提供</dd></div>
          </dl>
        </section>
      </main>

      <nav className="mobile-app-nav" aria-label="App 主导航">
        {TABS.map((item) => {
          const active = tab === item.key
          const badge = item.key === 'tasks' ? taskUnread : 0
          return (
            <button
              key={item.key}
              type="button"
              className={`min-h-[48px] ${active ? 'is-current' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={badge > 0 ? `${item.label}，${badge} 条未读` : undefined}
              onClick={() => onTabChange(item.key)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg>
              <span>{item.label}</span>
              {badge > 0 && (
                <span className="mobile-app-nav-badge" aria-hidden="true">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
