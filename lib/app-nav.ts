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
