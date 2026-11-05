import { test } from "node:test"
import assert from "node:assert/strict"

import {
  readCanvasQuery,
  readWorkspaceModeQuery,
  withCanvasQuery,
  withWorkspaceModeQuery,
  workspaceModeHref,
} from "../lib/app-nav.ts"

test("workspace mode defaults to overview", () => {
  assert.equal(readWorkspaceModeQuery(""), "overview")
  assert.equal(readWorkspaceModeQuery("?project=abc&step=shots"), "overview")
  assert.equal(readWorkspaceModeQuery("?view=unknown"), "overview")
})

test("workspace mode reads create and canvas", () => {
  assert.equal(readWorkspaceModeQuery("?view=create"), "create")
  assert.equal(readWorkspaceModeQuery("?view=canvas"), "canvas")
})

test("workspace mode preserves project and step while replacing view", () => {
  const project = "c196713c-0712-43d7-8dea-5f5f421ad7cb"
  const base = `?project=${project}&step=shots`
  const create = withWorkspaceModeQuery(base, "create")
  assert.match(create, /project=c196713c-0712-43d7-8dea-5f5f421ad7cb/)
  assert.match(create, /step=shots/)
  assert.match(create, /view=create/)

  const canvas = withWorkspaceModeQuery(create, "canvas")
  assert.match(canvas, /view=canvas/)
  assert.doesNotMatch(canvas, /view=create/)

  const overview = withWorkspaceModeQuery(canvas, "overview")
  assert.doesNotMatch(overview, /view=/)
})

test("legacy canvas query remains compatible", () => {
  assert.equal(readCanvasQuery("?view=canvas"), true)
  assert.equal(readCanvasQuery("?view=create"), false)
  assert.match(withCanvasQuery("?view=create&step=shots", true), /view=canvas/)
  assert.doesNotMatch(withCanvasQuery("?view=canvas&step=shots", false), /view=/)
})

test("workspace mode href keeps project and step", () => {
  const href = workspaceModeHref(
    "c196713c-0712-43d7-8dea-5f5f421ad7cb",
    "characters",
    "create",
  )
  assert.match(href, /^\/\?/)
  assert.match(href, /project=c196713c-0712-43d7-8dea-5f5f421ad7cb/)
  assert.match(href, /step=characters/)
  assert.match(href, /view=create/)
})
