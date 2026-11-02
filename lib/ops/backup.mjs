import { DatabaseSync } from "node:sqlite"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const MANIFEST = "manifest.json"
const DATABASE = "chengju.db"
const GENERATED = "generated"

function stamp(date) {
  const iso = date.toISOString()
  return iso.slice(0, 10).replaceAll("-", "")
    + "-"
    + iso.slice(11, 23).replaceAll(":", "").replace(".", "-")
}

function hashFile(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

function walkFiles(root, relative = "") {
  const full = path.join(root, relative)
  if (!fs.existsSync(full)) return []
  const files = []
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const next = relative ? path.join(relative, entry.name) : entry.name
    if (entry.isDirectory()) files.push(...walkFiles(root, next))
    else if (entry.isFile()) files.push(next.replaceAll("\\", "/"))
  }
  return files.sort()
}

function readManifest(backupDir) {
  const file = path.join(backupDir, MANIFEST)
  if (!fs.existsSync(file)) throw new Error("备份缺少 manifest.json")
  const value = JSON.parse(fs.readFileSync(file, "utf8"))
  if (
    !value
    || value.schemaVersion !== 1
    || typeof value.dbSha256 !== "string"
    || !Array.isArray(value.files)
  ) {
    throw new Error("备份 manifest 格式不正确")
  }
  return value
}

export function verifyDataBackup(backupDir) {
  const manifest = readManifest(backupDir)
  const database = path.join(backupDir, DATABASE)
  if (!fs.existsSync(database)) throw new Error("备份缺少数据库文件")
  if (hashFile(database) !== manifest.dbSha256) throw new Error("数据库哈希校验失败")

  const db = new DatabaseSync(database)
  try {
    const row = db.prepare("PRAGMA integrity_check").get()
    if (String(row?.integrity_check ?? "") !== "ok") {
      throw new Error("数据库完整性校验失败")
    }
  } finally {
    db.close()
  }

  for (const item of manifest.files) {
    const relative = String(item?.path ?? "")
    const normalized = relative.replaceAll("\\", "/")
    if (
      !normalized.startsWith(`${GENERATED}/`)
      || normalized.split("/").some((part) => part === ".." || part === "")
    ) {
      throw new Error("备份 manifest 包含非法文件路径")
    }
    const file = path.join(backupDir, ...normalized.split("/"))
    if (!fs.existsSync(file)) throw new Error(`备份图片缺失：${normalized}`)
    if (fs.statSync(file).size !== Number(item.bytes)) {
      throw new Error(`备份文件大小校验失败：${normalized}`)
    }
    if (hashFile(file) !== item.sha256) {
      throw new Error(`图片哈希校验失败：${normalized}`)
    }
  }
  return {
    dbSha256: manifest.dbSha256,
    generatedFiles: manifest.files.length,
  }
}

export function pruneDataBackups(backupRoot, keep = 7) {
  if (!Number.isSafeInteger(keep) || keep < 1) throw new Error("备份保留数量必须大于 0")
  if (!fs.existsSync(backupRoot)) return 0
  const valid = []
  for (const entry of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = path.join(backupRoot, entry.name)
    try {
      const manifest = readManifest(directory)
      valid.push({ directory, createdAt: String(manifest.createdAt ?? entry.name) })
    } catch {
      // 没有有效 manifest 的目录不属于本工具，保留不动
    }
  }
  valid.sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt)
    || right.directory.localeCompare(left.directory)
  )
  let removed = 0
  for (const item of valid.slice(keep)) {
    fs.rmSync(item.directory, { recursive: true, force: true })
    removed += 1
  }
  return removed
}

export function createDataBackup(input) {
  const dataDir = path.resolve(input.dataDir)
  const database = path.join(dataDir, DATABASE)
  if (!fs.existsSync(database)) throw new Error(`数据库不存在：${database}`)
  const backupRoot = path.resolve(input.backupRoot)
  fs.mkdirSync(backupRoot, { recursive: true })
  const now = input.now instanceof Date ? input.now : new Date(input.now ?? Date.now())
  const directory = path.join(backupRoot, stamp(now))
  if (fs.existsSync(directory)) throw new Error(`备份目录已存在：${directory}`)
  fs.mkdirSync(directory, { recursive: true })

  try {
    const source = new DatabaseSync(database)
    try {
      source.exec("PRAGMA busy_timeout = 5000")
      source.exec(`VACUUM INTO '${path.join(directory, DATABASE).replaceAll("'", "''")}'`)
    } finally {
      source.close()
    }

    const snapshot = new DatabaseSync(path.join(directory, DATABASE))
    try {
      const row = snapshot.prepare("PRAGMA integrity_check").get()
      if (String(row?.integrity_check ?? "") !== "ok") {
        throw new Error("数据库完整性校验失败")
      }
    } finally {
      snapshot.close()
    }

    const generatedSource = path.join(dataDir, GENERATED)
    if (fs.existsSync(generatedSource)) {
      fs.cpSync(generatedSource, path.join(directory, GENERATED), { recursive: true })
    }
    const files = walkFiles(directory, GENERATED).map((relative) => {
      const file = path.join(directory, ...relative.split("/"))
      return {
        path: relative,
        bytes: fs.statSync(file).size,
        sha256: hashFile(file),
      }
    })
    const manifest = {
      schemaVersion: 1,
      createdAt: now.toISOString(),
      appVersion: String(input.appVersion ?? ""),
      dbSha256: hashFile(path.join(directory, DATABASE)),
      generatedFiles: files.length,
      generatedBytes: files.reduce((sum, item) => sum + item.bytes, 0),
      files,
    }
    fs.writeFileSync(
      path.join(directory, MANIFEST),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8",
    )
    pruneDataBackups(backupRoot, input.keep ?? 7)
    return { directory, manifest }
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true })
    throw error
  }
}

export function restoreDataBackup(input) {
  if (!input.confirm) {
    throw new Error("恢复必须显式确认：设置 CHENGJU_RESTORE_CONFIRM=1")
  }
  const backupDir = path.resolve(input.backupDir)
  const targetDir = path.resolve(input.targetDir)
  verifyDataBackup(backupDir)
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new Error(`目标目录非空，拒绝覆盖：${targetDir}`)
  }
  fs.mkdirSync(targetDir, { recursive: true })
  try {
    fs.copyFileSync(path.join(backupDir, DATABASE), path.join(targetDir, DATABASE))
    if (fs.existsSync(path.join(backupDir, GENERATED))) {
      fs.cpSync(path.join(backupDir, GENERATED), path.join(targetDir, GENERATED), {
        recursive: true,
      })
    }
    fs.copyFileSync(path.join(backupDir, MANIFEST), path.join(targetDir, MANIFEST))
    return { directory: targetDir }
  } catch (error) {
    fs.rmSync(targetDir, { recursive: true, force: true })
    throw error
  }
}
