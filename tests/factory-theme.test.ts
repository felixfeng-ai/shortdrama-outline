import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

const files = {
  globals: fs.readFileSync("app/globals.css", "utf8"),
  workspace: fs.readFileSync("app/workspace-shell.css", "utf8"),
  docs: fs.readFileSync("app/docs/docs.css", "utf8"),
  legal: fs.readFileSync("app/legal/legal.css", "utf8"),
  novels: fs.readFileSync("app/novels/novel.css", "utf8"),
  localize: fs.readFileSync("app/localize/localize.css", "utf8"),
  storyboard: fs.readFileSync("app/storyboard/storyboard.css", "utf8"),
  appDownload: fs.readFileSync("app/app/app-download.css", "utf8"),
  skills: fs.readFileSync("app/skills/skills.css", "utf8"),
}

test("FACTORY1 shared production theme uses neutral near-black and restrained amber", () => {
  assert.match(files.globals, /--factory-ground:\s*#0d0e0e/i)
  assert.match(files.globals, /--factory-rail:\s*#101110/i)
  assert.match(files.globals, /--factory-surface:\s*#151615/i)
  assert.match(files.globals, /--factory-raised:\s*#1b1c1a/i)
  assert.match(files.globals, /--factory-ink:\s*#f3f2ed/i)
  assert.match(files.globals, /--factory-accent:\s*#d8b56d/i)
  assert.match(files.workspace, /--wfx-bg:\s*#0d0e0e/i)
  assert.match(files.workspace, /--wfx-side:\s*#101110/i)
})

test("FACTORY2 extended pages map their local themes to the shared factory roles", () => {
  assert.match(files.skills, /--bg:\s*var\(--factory-ground\)/)
  assert.match(files.skills, /--panel:\s*var\(--factory-surface\)/)
  assert.match(files.skills, /--raised:\s*var\(--factory-raised\)/)
  assert.match(files.skills, /--acid:\s*var\(--factory-accent\)/)
  assert.match(files.docs, /--docs-canvas:\s*var\(--factory-ground\)/)
  assert.match(files.legal, /--signal-bg:\s*var\(--factory-ground\)/)
  assert.match(files.novels, /--nv-bg:\s*var\(--factory-ground\)/)
  assert.match(files.localize, /--localize-bg:\s*var\(--factory-ground\)/)
  assert.match(files.storyboard, /--storyboard-ground:\s*var\(--factory-ground\)/)
  assert.match(files.appDownload, /--download-ground:\s*var\(--factory-ground\)/)
})

test("FACTORY3 announcement and review surfaces no longer use legacy cyan chrome", () => {
  assert.match(files.workspace, /\.wfx-content \.inline-release-bar\s*\{[^}]*background:\s*var\(--factory-surface\)/s)
  assert.match(files.globals, /\.release-dialog-scrim\s*\{[^}]*--release-accent:\s*var\(--factory-accent\)/s)
  assert.match(files.globals, /\.signal-desk \.review-page\s*\{[^}]*var\(--factory-ground\)/s)

  const allCss = Object.values(files).join("\n")
  assert.doesNotMatch(allCss, /#8dc8dc/i)
  assert.doesNotMatch(allCss, /#74a3ff/i)
  assert.doesNotMatch(allCss, /#90b7ff|#b5d4f7|#bce6f2|#668dbd|#42618a/i)
  assert.doesNotMatch(allCss, /rgba\(\s*141\s*,\s*200\s*,\s*220/i)
  assert.doesNotMatch(allCss, /rgba\(\s*113\s*,\s*167\s*,\s*255/i)
  assert.doesNotMatch(allCss, /rgba\(\s*80\s*,\s*130\s*,\s*200/i)
  assert.doesNotMatch(allCss, /rgba\(\s*142\s*,\s*183\s*,\s*231/i)
})

test("FACTORY4 legacy surfaces resolve through the neutral factory palette", () => {
  assert.match(files.globals, /\.signal-desk\s*\{[^}]*--signal-bg:\s*var\(--factory-ground\)/s)
  assert.match(files.globals, /\.release-dialog-scrim\s*\{[^}]*--release-canvas:\s*var\(--factory-ground\)/s)
  assert.match(files.workspace, /\.auth-page\s*\{[^}]*--wfx-accent:\s*var\(--factory-accent\)/s)
  assert.match(files.storyboard, /\.storyboard-shell\s*\{[^}]*background:\s*var\(--factory-ground\)/s)
  assert.match(files.novels, /--nv-surface:\s*var\(--factory-surface\)/)
  assert.match(files.appDownload, /--download-panel:\s*var\(--factory-surface\)/)
})
