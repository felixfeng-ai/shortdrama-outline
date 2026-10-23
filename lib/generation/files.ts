import fs from "node:fs"
import path from "node:path"

import { getDataDir } from "../assets/db.ts"

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

function generatedRoot(): string {
  const configured = process.env.CHENGJU_GENERATED_DIR?.trim()
  return path.resolve(configured && configured !== "undefined"
    ? configured
    : path.join(getDataDir(), "generated"))
}

function safeProjectId(projectId: string): string {
  const value = projectId.trim()
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("项目 id 非法")
  return value
}

function safeAssetId(assetId: string): string {
  const value = assetId.trim()
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("关键帧 id 非法")
  return value
}

export function resolveGeneratedStoragePath(storageKey: string): string {
  const key = storageKey.trim()
  if (!key || path.isAbsolute(key)) throw new Error("关键帧路径非法")
  const root = generatedRoot()
  const parts = key.replaceAll("\\", "/").split("/")
  if (parts[0] !== "generated" || parts.some((part) => part === ".." || part === "")) {
    throw new Error("关键帧路径非法")
  }
  const full = path.resolve(root, ...parts.slice(1))
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) {
    throw new Error("关键帧路径非法")
  }
  return full
}

export function writeGeneratedImage(
  projectId: string,
  assetId: string,
  bytes: Uint8Array,
  mime: string,
): { storageKey: string; bytes: number } {
  const ext = MIME_EXT[mime]
  if (!ext) throw new Error("不支持的图片格式")
  if (bytes.length === 0) throw new Error("图片内容为空")
  if (bytes.length > 15 * 1024 * 1024) throw new Error("关键帧图片不能超过 15MB")

  const project = safeProjectId(projectId)
  const asset = safeAssetId(assetId)
  const relative = path.posix.join("generated", project, `${asset}.${ext}`)
  const full = resolveGeneratedStoragePath(relative)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, bytes)
  return { storageKey: relative, bytes: bytes.length }
}

export function readGeneratedImage(storageKey: string): Uint8Array {
  const full = resolveGeneratedStoragePath(storageKey)
  if (!fs.existsSync(full)) throw new Error("关键帧文件不存在")
  return new Uint8Array(fs.readFileSync(full))
}

export function removeGeneratedProjectFiles(projectId: string): void {
  const project = safeProjectId(projectId)
  const root = generatedRoot()
  const target = path.resolve(root, project)
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("项目目录非法")
  }
  fs.rmSync(target, { recursive: true, force: true })
}
