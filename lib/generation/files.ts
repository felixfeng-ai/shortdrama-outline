import fs from "node:fs"
import path from "node:path"

import { getDataDir } from "../assets/db.ts"

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
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
  return readGeneratedAsset(storageKey)
}

export function writeGeneratedVideo(
  projectId: string,
  assetId: string,
  bytes: Uint8Array,
  mime: string,
): { storageKey: string; bytes: number } {
  if (mime !== "video/mp4") throw new Error("不支持的视频格式")
  if (bytes.length === 0) throw new Error("视频内容为空")
  if (bytes.length > 200 * 1024 * 1024) throw new Error("视频不能超过 200MB")
  const project = safeProjectId(projectId)
  const asset = safeAssetId(assetId)
  const relative = path.posix.join("generated", project, `${asset}.mp4`)
  const full = resolveGeneratedStoragePath(relative)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, bytes)
  return { storageKey: relative, bytes: bytes.length }
}

export function writeGeneratedAudio(
  projectId: string,
  assetId: string,
  bytes: Uint8Array,
  mime: string,
): { storageKey: string; bytes: number } {
  const ext = mime === "audio/mpeg"
    ? "mp3"
    : mime === "audio/wav" || mime === "audio/x-wav"
      ? "wav"
      : ""
  if (!ext) throw new Error("不支持的音频格式")
  if (bytes.length === 0) throw new Error("音频内容为空")
  if (bytes.length > 20 * 1024 * 1024) throw new Error("音频不能超过 20MB")
  const project = safeProjectId(projectId)
  const asset = safeAssetId(assetId)
  const relative = path.posix.join("generated", project, `${asset}.${ext}`)
  const full = resolveGeneratedStoragePath(relative)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, bytes)
  return { storageKey: relative, bytes: bytes.length }
}

export function readGeneratedAsset(storageKey: string): Uint8Array {
  const full = resolveGeneratedStoragePath(storageKey)
  if (!fs.existsSync(full)) throw new Error("关键帧文件不存在或生成资产缺失")
  return new Uint8Array(fs.readFileSync(full))
}

export function writeGeneratedArtifact(
  projectId: string,
  relativePath: string,
  bytes: Uint8Array,
  maxBytes = 500 * 1024 * 1024,
  allowEmpty = false,
): { storageKey: string; bytes: number } {
  // 渲染产物复用 generated 根目录，但只接受相对路径和普通路径段，禁止借输出目录穿越。
  if (bytes.length === 0 && !allowEmpty) throw new Error("渲染产物内容为空")
  if (bytes.length > maxBytes) throw new Error("渲染产物超过允许大小")
  const project = safeProjectId(projectId)
  const parts = relativePath.replaceAll("\\", "/").split("/")
  if (
    parts.length === 0
    || parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error("渲染产物路径非法")
  }
  const relative = path.posix.join("generated", project, ...parts)
  const full = resolveGeneratedStoragePath(relative)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, bytes)
  return { storageKey: relative, bytes: bytes.length }
}

export function removeGeneratedAsset(storageKey: string): void {
  const full = resolveGeneratedStoragePath(storageKey)
  fs.rmSync(full, { force: true })
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
