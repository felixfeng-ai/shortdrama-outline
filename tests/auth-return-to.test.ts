import { test } from "node:test"
import assert from "node:assert/strict"

import { safeReturnPath } from "../lib/auth/return-to.ts"

test("登录返回路径只允许站内工作台地址", () => {
  assert.equal(safeReturnPath("/?theme=neutral&step=shots"), "/?theme=neutral&step=shots")
  assert.equal(safeReturnPath("/canvas?project=abc"), "/canvas?project=abc")
  assert.equal(safeReturnPath("https://example.com"), "/")
  assert.equal(safeReturnPath("//example.com/steal"), "/")
  assert.equal(safeReturnPath("javascript:alert(1)"), "/")
  assert.equal(safeReturnPath("/\\example.com"), "/")
  assert.equal(safeReturnPath("/login?next=/%2Fexample.com"), "/")
  assert.equal(safeReturnPath(undefined), "/")
})
