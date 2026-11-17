"use client"

import { useEffect, useState } from "react"

import type { ProjectBulkDeleteScope, ProjectDto } from "@/lib/assets/api"
import type { WorkspaceMode } from "@/lib/app-nav"
import type { QuickCreationTarget } from "@/lib/production/quick-trial"
import type { StepKey } from "@/lib/types"
import {
  parseWorkspaceStartIntent,
  WORKSPACE_START_STORAGE_KEY,
  type WorkspaceStartIntent,
} from "@/lib/workspace-entry"
import InlineReleaseNotice from "./InlineReleaseNotice"
import SiteLegalFooter from "./SiteLegalFooter"
import WorkspaceModeTabs from "./WorkspaceModeTabs"
import WorkspaceOnboarding from "./WorkspaceOnboarding"
import WorkspaceSidebar from "./WorkspaceSidebar"
import WorkspaceTopbar from "./WorkspaceTopbar"

const EMPTY_COMPLETED: Record<StepKey, boolean> = {
  characters: false,
  acts: false,
  episodes: false,
  visuals: false,
  scenes: false,
  shots: false,
}

interface ProjectListEnvelope {
  success: boolean
  data: { projects: ProjectDto[] } | null
}

async function listOwnedProjects(): Promise<ProjectDto[]> {
  const response = await fetch("/api/projects", {
    credentials: "include",
    cache: "no-store",
  })
  const payload = await response.json().catch(() => null) as ProjectListEnvelope | null
  return response.ok && payload?.success ? payload.data?.projects ?? [] : []
}

/**
 * 无项目摘要时只加载这一页。
 * 真正的六步工作区、生成器、画布和 Agent 在用户开始创作或选择项目后再加载。
 */
export default function WorkspaceStart() {
  const [projects, setProjects] = useState<ProjectDto[]>([])
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void listOwnedProjects().then((items) => {
      if (!cancelled) setProjects(items)
    })
    return () => {
      cancelled = true
    }
  }, [])

  function openWorkspace(params: Record<string, string> = {}) {
    const url = new URL("/", window.location.origin)
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value)
    }
    window.location.assign(url)
  }

  function queueIntent(intent: WorkspaceStartIntent) {
    try {
      window.sessionStorage.setItem(WORKSPACE_START_STORAGE_KEY, JSON.stringify(intent))
    } catch {
      // 隐私模式无法写临时状态时仍进入工作区，由用户重新确认创作范围。
    }
    openWorkspace({ new: "1", view: "create" })
  }

  function switchProject(projectId: string) {
    openWorkspace({ project: projectId })
  }

  function openMode(mode: WorkspaceMode) {
    if (mode === "overview") {
      openWorkspace()
      return
    }
    openWorkspace({ new: "1", view: mode })
  }

  function modeHref(mode: WorkspaceMode): string {
    if (mode === "overview") return "/"
    return `/?new=1&view=${mode}`
  }

  async function deleteOwnedProject(projectId: string): Promise<boolean> {
    const response = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, {
      method: "DELETE",
      credentials: "include",
    })
    if (!response.ok) return false
    setProjects((current) => current.filter((project) => project.id !== projectId))
    return true
  }

  async function deleteOwnedProjects(scope: ProjectBulkDeleteScope): Promise<boolean> {
    const response = await fetch("/api/projects/bulk", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope }),
    })
    if (!response.ok) return false
    setProjects(await listOwnedProjects())
    return true
  }

  function openCurrentProjectOrCreate() {
    if (projects[0]) switchProject(projects[0].id)
    else openWorkspace({ new: "1", view: "create" })
  }

  return (
    <div className="signal-desk wfx-workspace">
      <WorkspaceSidebar
        mode="overview"
        activeStep="characters"
        completed={EMPTY_COMPLETED}
        homeActive
        projects={projects}
        projectId={null}
        projectTitle=""
        todoCount={0}
        quotaRefreshKey={0}
        episodeCount={30}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onHome={() => openWorkspace()}
        onSwitchProject={switchProject}
        onDeleteProject={deleteOwnedProject}
        onBulkDeleteProjects={deleteOwnedProjects}
        onNewProject={() => openWorkspace({ new: "1", view: "create" })}
        onOpenTodo={openCurrentProjectOrCreate}
        onOpenCreate={() => openMode("create")}
        onOpenAssets={openCurrentProjectOrCreate}
        onOpenStep={(step) => {
          if (projects[0]) openWorkspace({ project: projects[0].id, step })
          else openWorkspace({ new: "1", view: "create" })
        }}
        onOpenCanvas={() => openMode("canvas")}
        onOpenArtifacts={openCurrentProjectOrCreate}
        onOpenLedger={openCurrentProjectOrCreate}
        onOpenDelivery={() => {
          window.open("/delivery", "_blank", "noopener,noreferrer")
        }}
      />

      <div className="wfx-workspace-main">
        <WorkspaceTopbar
          mode="overview"
          projectTitle=""
          hasProject={false}
          savedLabel=""
          running={false}
          onOpenMobileMenu={() => setMobileOpen(true)}
          onExport={() => {}}
          onOpenMore={() => {}}
        />

        <div className="wfx-content">
          <InlineReleaseNotice />
          <div className="wfx-mode-strip">
            <WorkspaceModeTabs
              mode="overview"
              onChange={openMode}
              hrefForMode={modeHref}
            />
          </div>

          <WorkspaceOnboarding
            onStartQuickTrial={async (idea, target: QuickCreationTarget) => {
              queueIntent({ kind: "quick", idea, target })
            }}
            onStartGuided={(idea) => {
              queueIntent({ kind: "guided", idea })
            }}
            onOpenSource={() => {
              window.location.assign("/?view=create&mode=source")
            }}
            onLoadSample={() => {
              queueIntent({ kind: "sample" })
            }}
          />

          <SiteLegalFooter />
        </div>
      </div>
    </div>
  )
}
