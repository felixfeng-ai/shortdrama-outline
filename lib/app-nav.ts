import { STEPS, type StepKey } from "./types.ts"

const VALID_STEPS = new Set<StepKey>(STEPS.map((step) => step.key))

export function readStepQuery(search: string): StepKey | null {
  const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("step")
  return value && VALID_STEPS.has(value as StepKey) ? value as StepKey : null
}

export function withStepQuery(search: string, step: StepKey): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
  params.set("step", step)
  const value = params.toString()
  return value ? `?${value}` : ""
}
