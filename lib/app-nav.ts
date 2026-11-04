import { STEPS, type StepKey } from "./types.ts"

const VALID_STEPS = new Set<StepKey>(STEPS.map((step) => step.key))
export type AppTab = "agent" | "projects" | "tasks" | "me"
const VALID_APP_TABS = new Set<AppTab>(["agent", "projects", "tasks", "me"])

function toSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
}

function toSearch(params: URLSearchParams): string {
  const value = params.toString()
  return value ? `?${value}` : ""
}

export function readStepQuery(search: string): StepKey | null {
  const value = toSearchParams(search).get("step")
  return value && VALID_STEPS.has(value as StepKey) ? value as StepKey : null
}

export function withStepQuery(search: string, step: StepKey): string {
  const params = toSearchParams(search)
  params.set("step", step)
  return toSearch(params)
}

export function readAppTabQuery(search: string): AppTab | null {
  const value = toSearchParams(search).get("app")
  return value && VALID_APP_TABS.has(value as AppTab) ? value as AppTab : null
}

export function withAppTabQuery(search: string, tab: AppTab): string {
  const params = toSearchParams(search)
  params.set("app", tab)
  return toSearch(params)
}

export function withoutAppTabQuery(search: string): string {
  const params = toSearchParams(search)
  params.delete("app")
  return toSearch(params)
}
