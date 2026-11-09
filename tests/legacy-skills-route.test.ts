import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { withWorkspaceModeQuery } from "../lib/app-nav.ts"

const projectId = "7e76084c-879f-4c74-bb1a-8df6f9871a10"

test("NP6 legacy skills route preserves project, step and intake mode", () => {
  const page = fs.readFileSync("app/skills/page.tsx", "utf8")

  assert.match(page, /from ['"]next\/navigation['"]/)
  assert.match(page, /redirect\(/)
  assert.match(page, /withWorkspaceModeQuery/)
  assert.doesNotMatch(page, /<SkillCatalog/)
  assert.equal(
    withWorkspaceModeQuery(`?project=${projectId}&step=episodes&mode=source`, "create"),
    `?project=${projectId}&step=episodes&mode=source&view=create`,
  )
})
