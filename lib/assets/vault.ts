// 本地图库：像素只留在用户的机器上（原则 P1 的前端落点）。
//
// 两条路径：
//   1. Chrome/Edge —— File System Access API，授权目录后可直接读写本地文件夹
//   2. Safari/其他 —— <input type="file"> + IndexedDB 存 Blob
//
// 无论哪条路径，服务端只会收到 vaultKey 与 fileHash，图本身永不上传。
// 这不是「尽量不上传」，是设计上不提供上传通道。

export type VaultMode = "fs-access" | "indexeddb"

export interface VaultFile {
  key: string      // 图库内相对路径（fs-access）或 IndexedDB key（indexeddb）
  name: string
  hash: string     // sha-256，用于检测「图被替换」
  size: number
  mime: string
}

const DB_NAME = "chengju-vault"
const STORE = "blobs"
const HANDLE_STORE = "handles"

/** 能力探测：决定用哪条路径 */
export function detectVaultMode(): VaultMode {
  return typeof window !== "undefined" && "showDirectoryPicker" in window ? "fs-access" : "indexeddb"
}

/** 计算 sha-256（用于指纹校验） */
export async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest("SHA-256", buf)
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ── IndexedDB 基础操作 ─────────────────────────────────────────

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(store: string, key: string, value: unknown): Promise<void> {
  const db = await openVaultDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite")
    tx.objectStore(store).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  db.close()
}

async function idbGet<T>(store: string, key: string): Promise<T | null> {
  const db = await openVaultDb()
  const result = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, "readonly")
    const req = tx.objectStore(store).get(key)
    req.onsuccess = () => resolve((req.result as T) ?? null)
    req.onerror = () => reject(req.error)
  })
  db.close()
  return result
}

async function idbKeys(store: string): Promise<string[]> {
  const db = await openVaultDb()
  const keys = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(store, "readonly")
    const req = tx.objectStore(store).getAllKeys()
    req.onsuccess = () => resolve(req.result as string[])
    req.onerror = () => reject(req.error)
  })
  db.close()
  return keys
}

// ── 目录句柄的持久化（fs-access 路径）─────────────────────────

export async function saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await idbPut(HANDLE_STORE, "current", handle)
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  return idbGet<FileSystemDirectoryHandle>(HANDLE_STORE, "current")
}

/**
 * 选择素材文件夹并持久化句柄。
 * 刷新后调用 loadDirectoryHandle 即可恢复，无需重新选择。
 */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (detectVaultMode() !== "fs-access") return null
  const handle = await (window as unknown as {
    showDirectoryPicker: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>
  }).showDirectoryPicker({ mode: "readwrite" })
  await saveDirectoryHandle(handle)
  return handle
}

/** 递归列出目录下的图片（只要 image/*） */
export async function listImages(
  handle: FileSystemDirectoryHandle,
  prefix = "",
): Promise<VaultFile[]> {
  const out: VaultFile[] = []
  // @ts-expect-error values() 在 TS 的 lib.dom 里尚未覆盖
  for await (const entry of handle.values()) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.kind === "directory") {
      out.push(...(await listImages(entry as FileSystemDirectoryHandle, key)))
    } else {
      const file = await (entry as FileSystemFileHandle).getFile()
      if (!file.type.startsWith("image/")) continue
      out.push({
        key, name: entry.name, hash: await hashBlob(file), size: file.size, mime: file.type,
      })
    }
  }
  return out
}

// ── IndexedDB 路径 ─────────────────────────────────────────────

/** 把用户选的文件存进 IndexedDB（Safari 等不支持目录 API 的浏览器） */
export async function addFilesToVault(files: File[]): Promise<VaultFile[]> {
  const out: VaultFile[] = []
  for (const file of files) {
    const hash = await hashBlob(file)
    const key = `${hash.slice(0, 16)}-${file.name}`
    await idbPut(STORE, key, file)
    out.push({ key, name: file.name, hash, size: file.size, mime: file.type })
  }
  return out
}

export async function listVaultFiles(): Promise<VaultFile[]> {
  const keys = await idbKeys(STORE)
  const out: VaultFile[] = []
  for (const key of keys) {
    const blob = await idbGet<Blob>(STORE, key)
    if (!blob) continue
    out.push({
      key, name: key.replace(/^[0-9a-f]+-/, ""),
      hash: key.split("-")[0], size: blob.size, mime: blob.type || "image/png",
    })
  }
  return out
}

/** 取回可渲染的 blob URL（本地预览，零上传） */
export async function getPreviewUrl(key: string): Promise<string | null> {
  const blob = await idbGet<Blob>(STORE, key)
  return blob ? URL.createObjectURL(blob) : null
}
