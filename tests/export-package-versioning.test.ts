import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  buildProjectPackageManifest,
  PROJECT_PACKAGE_SCHEMA_VERSION,
} from "../lib/export/package.ts"
import {
  parseProjectPackage,
  readProjectPackage,
} from "../lib/export/import.ts"
import { POST as importProjectPackage } from "../app/api/project-import/route.ts"
import { __resetDbForTests } from "../lib/assets/store.ts"

const OWNER = `anon_${"v".repeat(48)}`

function currentManifest() {
  return buildProjectPackageManifest({
    project: { id: "old-project", title: "版本迁移测试", createdAt: 1, updatedAt: 2 },
    mode: "delivery",
    exportedAt: 3,
    projectSettings: {
      genre: "悬疑",
      episodeCount: 1,
      brief: {
        premise: "",
        payoff: "",
        destination: "",
        emotion: "",
        audience: "",
        references: "",
        redline: "",
      },
      look: { palette: "", light: "", lens: "", banned: "" },
      judgments: [],
    },
    story: {},
    assets: {},
    refs: [],
  })
}

function version2Manifest() {
  const value = structuredClone(currentManifest()) as unknown as Record<string, unknown>
  value.schemaVersion = 2
  delete value.materials
  delete value.ai
  delete value.files
  delete value.warnings
  return value
}

test("PKGVER1 新导出包写当前 v3", () => {
  assert.equal(PROJECT_PACKAGE_SCHEMA_VERSION, 3)
  assert.equal(currentManifest().schemaVersion, 3)
})

test("PKGVER2 当前 v3 正常读取，不做迁移", () => {
  const parsed = readProjectPackage(currentManifest())
  assert.equal(parsed.manifest.schemaVersion, 3)
  assert.equal(parsed.migration.migrated, false)
  assert.equal(parsed.migration.fromVersion, 3)
  assert.equal(parsed.migration.toVersion, 3)
})

test("PKGVER3 v2 迁移到 v3 并补齐新增字段", () => {
  const source = version2Manifest()
  const before = JSON.stringify(source)
  const parsed = readProjectPackage(source)
  assert.equal(parsed.manifest.schemaVersion, 3)
  assert.equal(parsed.migration.migrated, true)
  assert.equal(parsed.migration.fromVersion, 2)
  assert.equal(parsed.migration.toVersion, 3)
  assert.deepEqual(parsed.manifest.materials, [])
  assert.deepEqual(parsed.manifest.files, [])
  assert.deepEqual(parsed.manifest.warnings, [])
  assert.equal(parsed.manifest.ai.label, "AI 生成")
  assert.equal(parsed.manifest.reportPath, "export-report.json")
  assert.equal(JSON.stringify(source), before, "迁移不能修改原对象")
})

test("PKGVER4 v1、未来版本和未知 schema 被拒绝", () => {
  const v2 = version2Manifest()
  assert.throws(
    () => readProjectPackage({ ...v2, schemaVersion: 1 }),
    /不支持.*版本/,
  )
  assert.throws(
    () => readProjectPackage({ ...v2, schemaVersion: 4 }),
    /升级|不支持.*版本/,
  )
  assert.throws(
    () => readProjectPackage({ ...v2, schema: "other" }),
    /格式不正确/,
  )
})

test("PKGVER5 服务端导入返回迁移报告", async () => {
  __resetDbForTests(":memory:")
  const form = new FormData()
  form.set("manifest", JSON.stringify(version2Manifest()))
  const response = await importProjectPackage(new Request("http://localhost/api/project-import", {
    method: "POST",
    headers: new Headers({ cookie: `chengju_sid=${OWNER}` }),
    body: form,
  }))
  const payload = await response.json()
  assert.equal(response.status, 200, payload.error)
  assert.equal(payload.data.packageMigration.fromVersion, 2)
  assert.equal(payload.data.packageMigration.toVersion, 3)
  assert.equal(payload.data.packageMigration.migrated, true)
})

test("PKGVER6 页面提交原始包并展示迁移结果", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  assert.ok(page.includes("JSON.stringify(raw)"))
  assert.ok(page.includes("packageMigration"))
  assert.match(page, /已从 v\$\{.*fromVersion.*迁移/)
})

test("PKGVER7 parseProjectPackage 保持旧调用接口，返回迁移后的清单", () => {
  const manifest = parseProjectPackage(version2Manifest())
  assert.equal(manifest.schemaVersion, 3)
  assert.equal(manifest.ai.label, "AI 生成")
})
