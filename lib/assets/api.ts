// 资产链的前端请求封装。
// 复用 lib/api.ts 的 postJson（统一信封 + 中文错误），不重复造。
import { patchJson, postJson, putJson } from "@/lib/api"
import type { CreativeBrief } from "@/lib/brief"
import type { LookBook } from "@/lib/look"
import type { ArtifactKind, RefImageMeta, Shot, VisualCharacter, Scene, VisualPlace } from "@/lib/assets/types"
import type { ProjectMaterial, ProjectMaterialKind } from "@/lib/assets/materials"
import type {
  PersonalSkill,
  ProjectSkillBinding,
} from "@/lib/skills/personal"
import type {
  EntityComment,
  EntityCommentTarget,
} from "@/lib/entity-comments"
import type {
  ReusableAsset,
  ReusableAssetType,
} from "@/lib/assets/library"
import type {
  AgentMessageRole,
  ProjectAgentMessage,
  ProjectAgentThread,
  ProjectBranch,
} from "@/lib/project-collaboration"

export interface ProjectDto {
  id: string
  title: string
  ownerId?: string | null
  createdAt: number
  updatedAt: number
}

export type ProjectBulkDeleteScope = "duplicate-samples" | "all"

export interface ProjectBulkDeleteResult {
  scope: ProjectBulkDeleteScope
  deletedCount: number
  deletedIds: string[]
  keptProjectId: string | null
}
export interface SnapshotDto<T = unknown> {
  id: string; projectId?: string; branchId?: string; kind: string; version: number; payload: T; parents: string[]; createdAt: number
}

export interface ProjectContextDto {
  projectId: string
  brief: CreativeBrief
  look: LookBook
  episodeCount: number
  version: number
  updatedBy: string | null
  updatedAt: number
}

export interface ProjectDecisionDto {
  id: string
  projectId: string
  step: string
  targetType: string
  targetId: string
  question: string
  options: string[]
  chosenValue: string
  reason: string
  status: "proposed" | "accepted" | "rejected" | "locked"
  confidence: number | null
  locked: boolean
  ownerId: string
  basedOnSnapshotId: string | null
  impact: string[]
  createdAt: number
  updatedAt: number
}

export interface ProjectJudgmentDto {
  id: string
  projectId: string
  step: string
  action: string
  reason: string
  decisionId: string | null
  snapshotId: string | null
  ownerId: string
  createdAt: number
}

export interface CanonEntityDto {
  id: string
  projectId: string
  kind: "character" | "place" | "prop" | "relationship"
  name: string
  metadata: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface CanonFactDto {
  id: string
  projectId: string
  entityId: string
  entityName: string
  entityKind: CanonEntityDto["kind"]
  field: string
  value: string
  validFromEpisode: number
  validToEpisode: number
  sourceSnapshotId: string | null
  locked: boolean
  createdAt: number
  updatedAt: number
}

export interface CanonIssueDto {
  code: string
  severity: "error" | "warning"
  entityId: string
  entityName: string
  field: string
  message: string
  factIds: string[]
}

export interface ProjectCanonDto {
  entities: CanonEntityDto[]
  facts: CanonFactDto[]
  issues: CanonIssueDto[]
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

export const bulkDeleteProjects = (scope: ProjectBulkDeleteScope) =>
  postJson<ProjectBulkDeleteResult>("/api/projects/bulk", { scope })

/** 载入示例项目：已有示例时直接复用，不会继续制造重复副本。 */
export const loadSampleProject = () =>
  postJson<{ project: ProjectDto; reused: boolean }>('/api/sample', {})

export const listSnapshots = <T>(projectId: string, kind: string, branchId = "") =>
  fetch(`/api/snapshots?projectId=${encodeURIComponent(projectId)}&kind=${encodeURIComponent(kind)}${branchId ? `&branchId=${encodeURIComponent(branchId)}` : ""}`)
    .then((r) => r.json())
    .then((p) => p.data.snapshots as SnapshotDto<T>[])

export async function fetchProjectContext(projectId: string): Promise<ProjectContextDto | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/context`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "项目设置读取失败")
  }
  return payload.data.context as ProjectContextDto | null
}

export async function saveProjectContext(
  projectId: string,
  input: {
    brief: CreativeBrief
    look: LookBook
    episodeCount: number
    version?: number
  },
): Promise<ProjectContextDto> {
  return putJson<{ context: ProjectContextDto }>(
    `/api/projects/${encodeURIComponent(projectId)}/context`,
    input,
  ).then((data) => data.context)
}

export async function fetchProjectDecisions(projectId: string): Promise<{
  decisions: ProjectDecisionDto[]
  judgments: ProjectJudgmentDto[]
}> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/decisions`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "创作决策读取失败")
  }
  return payload.data as {
    decisions: ProjectDecisionDto[]
    judgments: ProjectJudgmentDto[]
  }
}

export async function createProjectDecision(
  projectId: string,
  input: {
    step: string
    targetType?: string
    targetId?: string
    question: string
    options: string[]
    chosenValue?: string
    reason?: string
    status?: "proposed" | "accepted" | "rejected" | "locked"
    confidence?: number
    locked?: boolean
    basedOnSnapshotId?: string
    impact?: string[]
  },
): Promise<ProjectDecisionDto> {
  return postJson<{ decision: ProjectDecisionDto }>(
    `/api/projects/${encodeURIComponent(projectId)}/decisions`,
    input,
  ).then((data) => data.decision)
}

export async function createProjectJudgment(
  projectId: string,
  input: { step: string; action: string; reason?: string; decisionId?: string; snapshotId?: string },
): Promise<ProjectJudgmentDto> {
  return postJson<{ judgment: ProjectJudgmentDto }>(
    `/api/projects/${encodeURIComponent(projectId)}/judgments`,
    input,
  ).then((data) => data.judgment)
}

export async function fetchPersonalSkills(): Promise<PersonalSkill[]> {
  const response = await fetch("/api/personal-skills", { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "个人 Skill 读取失败")
  }
  return payload.data.skills as PersonalSkill[]
}

export async function createPersonalSkill(input: {
  name: string
  summary?: string
  mainDoc: string
  references?: string[]
  stageRules?: Record<string, string>
  acceptance?: string[]
}): Promise<PersonalSkill> {
  return postJson<{ skill: PersonalSkill }>("/api/personal-skills", input)
    .then((data) => data.skill)
}

export async function publishPersonalSkillVersion(
  skillId: string,
  input: {
    name: string
    summary?: string
    mainDoc: string
    references?: string[]
    stageRules?: Record<string, string>
    acceptance?: string[]
    changeNote?: string
  },
): Promise<PersonalSkill> {
  return postJson<{ skill: PersonalSkill }>(
    `/api/personal-skills/${encodeURIComponent(skillId)}/versions`,
    input,
  ).then((data) => data.skill)
}

export async function fetchProjectSkill(projectId: string): Promise<ProjectSkillBinding | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/skill`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "项目 Skill 读取失败")
  }
  return payload.data.binding as ProjectSkillBinding | null
}

export async function applyProjectSkill(
  projectId: string,
  skillId: string,
  version: number,
): Promise<ProjectSkillBinding> {
  return putJson<{ binding: ProjectSkillBinding }>(
    `/api/projects/${encodeURIComponent(projectId)}/skill`,
    { skillId, version },
  ).then((data) => data.binding)
}

export async function fetchProjectComments(
  projectId: string,
  filter: { targetType?: EntityCommentTarget; targetId?: string } = {},
): Promise<EntityComment[]> {
  const query = new URLSearchParams()
  if (filter.targetType) query.set("targetType", filter.targetType)
  if (filter.targetId) query.set("targetId", filter.targetId)
  const suffix = query.toString() ? `?${query.toString()}` : ""
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/comments${suffix}`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "项目批注读取失败")
  }
  return payload.data.comments as EntityComment[]
}

export async function createProjectComment(
  projectId: string,
  input: { targetType: EntityCommentTarget; targetId: string; body: string },
): Promise<EntityComment> {
  return postJson<{ comment: EntityComment }>(
    `/api/projects/${encodeURIComponent(projectId)}/comments`,
    input,
  ).then((data) => data.comment)
}

export async function updateProjectComment(
  projectId: string,
  commentId: string,
  input: { status?: "open" | "resolved"; body?: string },
): Promise<EntityComment> {
  return patchJson<{ comment: EntityComment }>(
    `/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}`,
    input,
  ).then((data) => data.comment)
}

export async function listReusableAssets(assetType?: ReusableAssetType): Promise<ReusableAsset[]> {
  const suffix = assetType ? `?assetType=${encodeURIComponent(assetType)}` : ""
  const response = await fetch(`/api/asset-library${suffix}`, { cache: "no-store" })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "跨项目资产读取失败")
  }
  return payload.data.assets as ReusableAsset[]
}

export async function saveReusableAsset(input: {
  projectId: string
  assetType: ReusableAssetType
  name: string
  sourceAssetId?: string
  content: Record<string, unknown>
}): Promise<ReusableAsset> {
  return postJson<{ asset: ReusableAsset }>("/api/asset-library", input)
    .then((data) => data.asset)
}

export async function listProjectThreads(projectId: string): Promise<ProjectAgentThread[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/threads`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "会话列表读取失败")
  return payload.data.threads as ProjectAgentThread[]
}

export async function createProjectThread(
  projectId: string,
  title?: string,
): Promise<ProjectAgentThread> {
  return postJson<{ thread: ProjectAgentThread }>(
    `/api/projects/${encodeURIComponent(projectId)}/threads`,
    { title },
  ).then((data) => data.thread)
}

export async function fetchProjectThread(
  projectId: string,
  threadId: string,
): Promise<ProjectAgentThread> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "会话读取失败")
  return payload.data.thread as ProjectAgentThread
}

export async function appendProjectThreadMessage(
  projectId: string,
  threadId: string,
  input: { role: AgentMessageRole; content: string },
): Promise<ProjectAgentMessage> {
  return postJson<{ message: ProjectAgentMessage }>(
    `/api/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}/messages`,
    input,
  ).then((data) => data.message)
}

export async function listProjectBranches(projectId: string): Promise<ProjectBranch[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/branches`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "版本分支读取失败")
  return payload.data.branches as ProjectBranch[]
}

export async function createProjectBranch(
  projectId: string,
  input: { name: string; baseSnapshotId: string; note?: string },
): Promise<ProjectBranch> {
  return postJson<{ branch: ProjectBranch }>(
    `/api/projects/${encodeURIComponent(projectId)}/branches`,
    input,
  ).then((data) => data.branch)
}

export async function fetchProjectCanon(projectId: string): Promise<ProjectCanonDto> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/canon`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Canon 读取失败")
  }
  return payload.data as ProjectCanonDto
}

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
  brief?: CreativeBrief,
  signal?: AbortSignal,
) =>
  postJson<{ scenes: Scene[]; places: VisualPlace[] }>(
    "/api/scenes", { projectId, idea, characters, episodes, genre, brief }, signal,
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

export async function importProjectPackage(form: FormData): Promise<{
  project: ProjectDto
  counts: { snapshots: number; tasks: number; keyframes: number; refs: number; sources?: number }
  packageMigration?: {
    fromVersion: number
    toVersion: number
    migrated: boolean
    steps: string[]
  }
  warnings: string[]
}> {
  const response = await fetch("/api/project-import", { method: "POST", body: form })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "项目包导入失败，请重试")
  }
  return payload.data
}

export const createProjectReviewShare = (projectId: string) =>
  postJson<{
    share: { id: string; token: string; path: string; expiresAt: number }
  }>("/api/project-shares", { projectId })

export type { Shot, VisualCharacter, Scene, VisualPlace }

export interface ProjectQuotaEstimateDto {
  episodeCount: number
  units: number
  projectsLeft: number
}

export interface QuotaDto {
  used: number
  limit: number
  globalUsed: number
  globalLimit: number
  remaining: number
  episodeCount: number
  projectCost: number
  projectEstimate: ProjectQuotaEstimateDto
  projectEstimates: ProjectQuotaEstimateDto[]
  estimates: {
    selected: ProjectQuotaEstimateDto
    presets: ProjectQuotaEstimateDto[]
  }
  mediaCosts: {
    imageGenerate: number
    imageEdit: number
    render: number
    unitMicros: number
  }
  pricingVersion: string
  fullProjectCost: number
  tenEpisodeProjectCost: number
  stepCost: Record<string, number>
  /** 当前集数下还能跑几个纯文本项目 */
  projectsLeft: number
}

/** 查当前身份的剩余额度（只读，不扣分） */
export const fetchQuota = (episodeCount?: number) =>
  fetch(`/api/quota${episodeCount ? `?episodeCount=${encodeURIComponent(episodeCount)}` : ""}`)
    .then((r) => r.json())
    .then((p) => p.data as QuotaDto)

export async function fetchProjectMaterials(
  projectId: string,
  includeContent = false,
): Promise<ProjectMaterial[]> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/materials${includeContent ? "?includeContent=1" : ""}`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "项目原文读取失败")
  }
  return payload.data.materials as ProjectMaterial[]
}

export async function fetchProjectMaterialChunk(
  projectId: string,
  materialId: string,
  chunk: number,
): Promise<{ id: string; name: string; kind: string; title: string; content: string; characterCount: number }> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/materials?materialId=${encodeURIComponent(materialId)}&chunk=${chunk}`,
    { cache: "no-store" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "原文章节读取失败")
  }
  return {
    ...payload.data.material,
    ...payload.data.chunk,
  }
}

export async function createProjectMaterial(
  projectId: string,
  input: {
    name: string
    content: string
    mime?: string
    bytes?: number
    kind?: ProjectMaterialKind
  },
): Promise<ProjectMaterial & { deduped: boolean }> {
  return postJson<{
    material: ProjectMaterial & { deduped: boolean }
    deduped: boolean
  }>(
    `/api/projects/${encodeURIComponent(projectId)}/materials`,
    input,
  ).then((data) => data.material)
}

export async function deleteProjectMaterial(
  projectId: string,
  materialId: string,
): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/materials?id=${encodeURIComponent(materialId)}`,
    { method: "DELETE" },
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "原文移除失败")
  }
}
