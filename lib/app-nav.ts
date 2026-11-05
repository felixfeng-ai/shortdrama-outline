import { STEPS, type StepKey } from "./types.ts"

const VALID_STEPS = new Set<StepKey>(STEPS.map((step) => step.key))
const VALID_PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function searchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
}

export function readStepQuery(search: string): StepKey | null {
  const value = searchParams(search).get("step")
  return value && VALID_STEPS.has(value as StepKey) ? value as StepKey : null
}

export function withStepQuery(search: string, step: StepKey): string {
  const params = searchParams(search)
  params.set("step", step)
  const value = params.toString()
  return value ? `?${value}` : ""
}

export function readProjectQuery(search: string): string | null {
  const value = searchParams(search).get("project")?.trim() ?? ""
  return VALID_PROJECT_ID.test(value) ? value : null
}

export function withProjectQuery(search: string, projectId: string | null): string {
  const params = searchParams(search)
  if (projectId) params.set("project", projectId)
  else params.delete("project")
  const value = params.toString()
  return value ? `?${value}` : ""
}

export type WorkspaceMode = "overview" | "create" | "canvas"

/** 工作台模式是 URL 状态，刷新、前进和后退都恢复同一工作面。 */
export function readWorkspaceModeQuery(search: string): WorkspaceMode {
  const value = searchParams(search).get("view")
  if (value === "create" || value === "canvas") return value
  return "overview"
}

export function withWorkspaceModeQuery(search: string, mode: WorkspaceMode): string {
  const params = searchParams(search)
  if (mode === "overview") params.delete("view")
  else params.set("view", mode)
  const value = params.toString()
  return value ? `?${value}` : ""
}

/** 画布是工作台的 URL 状态，刷新与浏览器前进后退都能恢复。 */
export function readCanvasQuery(search: string): boolean {
  return readWorkspaceModeQuery(search) === "canvas"
}

export function withCanvasQuery(search: string, open: boolean): string {
  return withWorkspaceModeQuery(search, open ? "canvas" : "overview")
}

function buildHref(pathname: string, params: URLSearchParams): string {
  const value = params.toString()
  return value ? `${pathname}?${value}` : pathname
}

export function workspaceHref(projectId: string | null, step?: StepKey | null): string {
  const params = new URLSearchParams()
  if (projectId) params.set("project", projectId)
  if (step) params.set("step", step)
  return buildHref("/", params)
}

export function workspaceModeHref(
  projectId: string | null,
  step: StepKey | null | undefined,
  mode: WorkspaceMode,
): string {
  const params = new URLSearchParams()
  if (projectId) params.set("project", projectId)
  if (step) params.set("step", step)
  if (mode !== "overview") params.set("view", mode)
  return buildHref("/", params)
}

export function skillsHref(projectId: string | null, step?: StepKey | null): string {
  const params = new URLSearchParams()
  if (projectId) params.set("project", projectId)
  if (step) params.set("step", step)
  return buildHref("/skills", params)
}

export function canvasHref(projectId: string | null, step?: StepKey | null): string {
  const params = new URLSearchParams()
  if (projectId) params.set("project", projectId)
  if (step) params.set("step", step)
  params.set("view", "canvas")
  return buildHref("/", params)
}
