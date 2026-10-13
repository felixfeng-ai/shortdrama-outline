// 资产链的前端请求封装。
// 复用 lib/api.ts 的 postJson（统一信封 + 中文错误），不重复造。
import { postJson } from "@/lib/api"
import type { Shot, VisualCharacter, Scene } from "@/lib/assets/types"

export interface ProjectDto { id: string; title: string; createdAt: number; updatedAt: number }
export interface SnapshotDto<T = unknown> {
  id: string; kind: string; version: number; payload: T; parents: string[]; createdAt: number
}

export const createProject = (title: string) =>
  postJson<{ project: ProjectDto }>("/api/projects", { title })

export const listProjects = () =>
  fetch("/api/projects").then((r) => r.json()).then((p) => p.data.projects as ProjectDto[])

export const listSnapshots = <T>(projectId: string, kind: string) =>
  fetch(`/api/snapshots?projectId=${projectId}&kind=${kind}`)
    .then((r) => r.json())
    .then((p) => p.data.snapshots as SnapshotDto<T>[])

/** 影响范围：改一处之后，哪些下游快照过期了 */
export const findImpact = (snapshotId: string) =>
  fetch(`/api/impact?snapshotId=${snapshotId}`)
    .then((r) => r.json())
    .then((p) => p.data.affected as SnapshotDto[])

export const generateVisuals = (projectId: string | null, idea: string, characters: unknown) =>
  postJson<{ visualCharacters: VisualCharacter[]; imagePrompts: unknown[] }>("/api/visual", {
    projectId, idea, characters,
  })

export const generateScenes = (projectId: string | null, idea: string, characters: unknown, episodes: unknown) =>
  postJson<{ scenes: Scene[] }>("/api/scenes", { projectId, idea, characters, episodes })

export interface RefInput {
  vaultKey: string; label: string; fileHash: string
  mime?: string; bytes?: number; ownerType: "character" | "shot"; ownerId: string
}

export const registerRefs = (projectId: string, refs: RefInput[]) =>
  postJson<{ refs: unknown[] }>("/api/refs", { projectId, refs })

export const listRefs = (projectId: string) =>
  fetch(`/api/refs?projectId=${projectId}`).then((r) => r.json()).then((p) => p.data.refs)

export const fetchExportManifest = (projectId: string) =>
  fetch(`/api/export?projectId=${projectId}`).then((r) => r.json()).then((p) => p.data.manifest)

export type { Shot, VisualCharacter, Scene }
