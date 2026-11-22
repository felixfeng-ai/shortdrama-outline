import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  classifyDirectoryAccessError,
  getDirectoryAccess,
  scanDirectoryFiles,
} from "../lib/assets/vault.ts"

function directoryHandle(input: {
  queryPermission?: () => Promise<PermissionState>
  requestPermission?: () => Promise<PermissionState>
  values?: () => AsyncGenerator<unknown>
}): FileSystemDirectoryHandle {
  return input as unknown as FileSystemDirectoryHandle
}

test("P8-A 启动只查询权限，点重新授权时才申请读取权限", async () => {
  let requested = 0
  const handle = directoryHandle({
    queryPermission: async () => "prompt",
    requestPermission: async () => {
      requested += 1
      return "granted"
    },
    values: async function* () {},
  })

  const passive = await getDirectoryAccess(handle)
  assert.equal(passive.status, "needs-permission")
  assert.equal(passive.reason, "prompt")
  assert.equal(passive.canRead, false)
  assert.equal(requested, 0)

  const active = await getDirectoryAccess(handle, { requestPermission: true })
  assert.equal(active.status, "connected")
  assert.equal(active.canRead, true)
  assert.equal(requested, 1)
})

test("P8-B 用户取消与明确拒绝使用不同原因，且都要求重新授权", async () => {
  const cancelled = await getDirectoryAccess(directoryHandle({
    queryPermission: async () => "prompt",
    requestPermission: async () => {
      throw new DOMException("用户取消", "AbortError")
    },
  }), { requestPermission: true })
  assert.equal(cancelled.status, "needs-permission")
  assert.equal(cancelled.reason, "cancelled")
  assert.match(cancelled.message, /取消/)

  const denied = await getDirectoryAccess(directoryHandle({
    queryPermission: async () => "prompt",
    requestPermission: async () => {
      throw new DOMException("权限被拒绝", "NotAllowedError")
    },
  }), { requestPermission: true })
  assert.equal(denied.status, "needs-permission")
  assert.equal(denied.reason, "denied")
  assert.match(denied.message, /拒绝|网站设置/)
})

test("P8-C 目录缺失或扫描失败时返回 files=null，不伪装成空图库", async () => {
  const missing = await scanDirectoryFiles(directoryHandle({
    queryPermission: async () => "granted",
    values: async function* () {
      throw new DOMException("目录不存在", "NotFoundError")
    },
  }))
  assert.equal(missing.access.status, "missing")
  assert.equal(missing.files, null)

  const failed = await scanDirectoryFiles(directoryHandle({
    queryPermission: async () => {
      throw new DOMException("I/O failure", "UnknownError")
    },
  }))
  assert.equal(failed.access.status, "error")
  assert.equal(failed.files, null)
})

test("P8-D 成功扫描空目录仍返回空数组，表示确实没有图片", async () => {
  const scanned = await scanDirectoryFiles(directoryHandle({
    queryPermission: async () => "granted",
    values: async function* () {},
  }))
  assert.equal(scanned.access.status, "connected")
  assert.deepEqual(scanned.files, [])
})

test("P8-E 页面不再吞掉目录异常，面板展示授权恢复状态", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8")
  const panel = fs.readFileSync("components/VaultPanel.tsx", "utf8")
  const vault = fs.readFileSync("lib/assets/vault.ts", "utf8")

  assert.doesNotMatch(page, /listImages\([^)]*\)\.catch\(\(\) => \[\]\)/)
  assert.match(page, /scanDirectoryFiles/)
  assert.match(page, /if \(scan\.files\)[\s\S]{0,120}setAllVaultFiles\(scan\.files\)/)
  assert.match(page, /if \(mode === 'indexeddb'\) \{[\s\S]{0,80}listVaultFiles\(\)/)
  assert.match(panel, /directoryAccess/)
  assert.match(panel, /重新授权素材文件夹/)
  assert.match(panel, /已挂引用暂时读不到/)
  assert.match(vault, /requestPermission/)
  assert.match(vault, /Filesystem 目录被移动或删除/)
})

test("P8-F 错误分类覆盖权限、目录缺失和其他失败", () => {
  const denied = classifyDirectoryAccessError(
    new DOMException("denied", "NotAllowedError"),
  )
  const missing = classifyDirectoryAccessError(
    new DOMException("missing", "NotFoundError"),
  )
  const cancelled = classifyDirectoryAccessError(
    new DOMException("cancel", "AbortError"),
  )
  const generic = classifyDirectoryAccessError(new Error("boom"))

  assert.equal(denied.status, "needs-permission")
  assert.equal(denied.reason, "denied")
  assert.equal(missing.status, "missing")
  assert.equal(cancelled.reason, "cancelled")
  assert.equal(generic.status, "error")
})
