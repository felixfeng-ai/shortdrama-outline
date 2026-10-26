// 资产链的前端请求封装。
// 复用 lib/api.ts 的 postJson（统一信封 + 中文错误），不重复造。
import { patchJson, postJson } from "@/lib/api"
import type { ArtifactKind, RefImageMeta, Shot, VisualCharacter, Scene, VisualPlace } from "@/lib/assets/types"

export interface ProjectDto {
  id: string
  title: string
  ownerId?: string | null
  createdAt: number
  updatedAt: number
}
export interface SnapshotDto<T = unknown> {
  id: string; kind: string; version: number; payload: T; parents: string[]; createdAt: number
}

export const createProject = (title: string) =>
  postJson<{ project: ProjectDto }>("/api/projects", { title })

export const listProjects = () =>
  fetch("/api/projects").then((r) => r.json()).then((p) => p.data.projects as ProjectDto[])

/** 重命名项目（PATCH，只改显示名） */
export const renameProject = (id: string, title: string) =>
  patchJson<{ project: ProjectDto }>("/api/projects", { id, title })

export const deleteProject = (id: string) =>
  fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    .then((r) => r.json())
    .then((p) => {
      if (!p.success) throw new Error(p.error || "删除失败，请重试")
      return true
    })

/** 载入示例项目：服务端写一整套六步产物，返回新项目（不调模型、不扣额度） */
export const loadSampleProject = () => postJson<{ project: ProjectDto }>('/api/sample', {})

export const listSnapshots = <T>(projectId: string, kind: string) =>
  fetch(`/api/snapshots?projectId=${projectId}&kind=${kind}`)
    .then((r) => r.json())
    .then((p) => p.data.snapshots as SnapshotDto<T>[])

/** 手工保存一版产物；画布编辑和完整工作台后续都可复用 */
export const saveSnapshot = <T>(projectId: string, kind: ArtifactKind, payload: T) =>
  postJson<{ snapshot: SnapshotDto<T> }>("/api/snapshots", { projectId, kind, payload })

/** 影响范围：改一处之后，哪些下游快照过期了 */
export const findImpact = (snapshotId: string) =>
  fetch(`/api/impact?snapshotId=${snapshotId}`)
    .then((r) => r.json())
    .then((p) => p.data.affected as SnapshotDto[])

export const generateVisuals = (
  projectId: string | null,
  idea: string,
  characters: unknown,
  genre = "none",
  signal?: AbortSignal,
) =>
  postJson<{ visualCharacters: VisualCharacter[]; imagePrompts: unknown[] }>("/api/visual", {
    projectId, idea, characters, genre,
  }, signal)

export const generateScenes = (
  projectId: string | null,
  idea: string,
  characters: unknown,
  episodes: unknown,
  genre = "none",
  signal?: AbortSignal,
) =>
  postJson<{ scenes: Scene[]; places: VisualPlace[] }>(
    "/api/scenes", { projectId, idea, characters, episodes, genre }, signal,
  )

export interface RefInput {
  vaultKey: string; label: string; fileHash: string
  mime?: string; bytes?: number; ownerType: "character" | "place" | "shot"; ownerId: string
}

export const registerRefs = (projectId: string, refs: RefInput[]) =>
  postJson<{ refs: unknown[] }>("/api/refs", { projectId, refs })

export const listRefs = (projectId: string) =>
  fetch(`/api/refs?projectId=${projectId}`)
    .then((r) => r.json())
    .then((p) => p.data.refs as RefImageMeta[])

export const fetchExportManifest = (projectId: string) =>
  fetch(`/api/export?projectId=${projectId}`).then((r) => r.json()).then((p) => p.data.manifest)

export const createProjectReviewShare = (projectId: string) =>
  postJson<{
    share: { id: string; token: string; path: string; expiresAt: number }
  }>("/api/project-shares", { projectId })

export type { Shot, VisualCharacter, Scene, VisualPlace }

export interface QuotaDto {
  used: number
  limit: number
  globalUsed: number
  globalLimit: number
  remaining: number
  fullProjectCost: number
  stepCost: Record<string, number>
  /** 还能跑几个完整项目 */
  projectsLeft: number
}

/** 查当前身份的剩余额度（只读，不扣分） */
export const fetchQuota = () =>
  fetch("/api/quota").then((r) => r.json()).then((p) => p.data as QuotaDto)
