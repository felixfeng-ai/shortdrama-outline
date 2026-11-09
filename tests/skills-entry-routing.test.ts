import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

test("NP7 active source entries stay inside the unified workspace", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const guide = fs.readFileSync("components/DocsGuide.tsx", "utf8")
  const sourceStart = page.indexOf("const openWorkspaceSource")
  const sourceEnd = page.indexOf("\n  const openWorkspaceLedger", sourceStart + 1)
  const sourceEntry = page.slice(sourceStart, sourceEnd)

  assert.ok(sourceStart >= 0)
  assert.doesNotMatch(sourceEntry, /\/skills/)
  assert.match(sourceEntry, /view['"]?\s*,\s*['"]create/)
  assert.match(sourceEntry, /mode['"]?\s*,\s*['"]source/)
  assert.doesNotMatch(guide, /href=["']\/skills/)
  assert.match(guide, /href=["']\/\?view=create&amp;mode=source["']/)
})
