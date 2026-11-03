import { postJson } from "@/lib/api"
import type { ContinuityReport } from "./continuity"
import type {
  DeterministicSkillId,
  DeterministicSkillReport,
} from "./deterministic"

export async function runContinuitySkill(projectId: string): Promise<ContinuityReport> {
  const data = await postJson<{ report: ContinuityReport }>(
    "/api/skills/continuity/run",
    { projectId },
  )
  return data.report
}

export async function runDeterministicSkill(
  projectId: string,
  skill: DeterministicSkillId,
): Promise<DeterministicSkillReport> {
  const data = await postJson<{ report: DeterministicSkillReport }>(
    "/api/skills/deterministic/run",
    { projectId, skill },
  )
  return data.report
}
