import fs from "node:fs"
import type { DatabaseSync } from "node:sqlite"

import {
  readGeneratedAsset,
  resolveGeneratedStoragePath,
} from "../generation/files.ts"
import { episodeFileCode } from "./dto.ts"
import {
  getDeliveryItem,
  getDeliveryPackageById,
} from "./repo.ts"

export type DeliveryArtifactKind =
  | "package"
  | "manifest"
  | "clean"
  | "publish"
  | "srt"
  | "ass"
  | "cover"
  | "metadata"

export function readDeliveryArtifact(
  db: DatabaseSync,
  packageId: string,
  kind: DeliveryArtifactKind,
  itemId?: string,
): { bytes: Uint8Array; mime: string; filename: string } | null {
  const pkg = getDeliveryPackageById(db, packageId)
  if (!pkg || pkg.status !== "ready") return null
  if (kind === "package" || kind === "manifest") {
    const storageKey = kind === "package" ? pkg.packageStorageKey : pkg.manifestStorageKey
    if (!storageKey || !fs.existsSync(resolveGeneratedStoragePath(storageKey))) return null
    return {
      bytes: readGeneratedAsset(storageKey),
      mime: kind === "package" ? "application/zip" : "application/json; charset=utf-8",
      filename: kind === "package" ? `${safeFilename(pkg.title)}.zip` : "manifest.json",
    }
  }
  if (!itemId) return null
  const item = getDeliveryItem(db, pkg.id, itemId)
  if (!item || item.status !== "ready") return null
  const code = episodeFileCode(item.episode)
  if (kind === "metadata") {
    return {
      bytes: new TextEncoder().encode(`${JSON.stringify(JSON.parse(item.metadataJson || "{}"), null, 2)}\n`),
      mime: "application/json; charset=utf-8",
      filename: `${code}-metadata.json`,
    }
  }
  const storageKey = kind === "clean"
    ? item.cleanVideoKey
    : kind === "publish"
      ? item.publishVideoKey
      : kind === "srt"
        ? item.srtKey
        : kind === "ass"
          ? item.assKey
          : item.coverKey
  if (!storageKey || !fs.existsSync(resolveGeneratedStoragePath(storageKey))) return null
  return {
    bytes: readGeneratedAsset(storageKey),
    mime: kind === "clean" || kind === "publish"
      ? "video/mp4"
      : kind === "srt"
        ? "application/x-subrip; charset=utf-8"
        : kind === "ass"
          ? "text/x-ssa; charset=utf-8"
          : "image/jpeg",
    filename: kind === "clean"
      ? `${code}-clean.mp4`
      : kind === "publish"
        ? `${code}-publish.mp4`
        : kind === "srt"
          ? `${code}.srt`
          : kind === "ass"
            ? `${code}.ass`
            : `${code}-cover.jpg`,
  }
}

function safeFilename(value: string): string {
  return value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 80) || "delivery-package"
}
