import type { RefImageMeta } from "./types.ts"
import type { VaultFile } from "./vault.ts"

export interface RefRelinkUpdate {
  id: string
  vaultKey: string
  fileHash: string
  mime: string
  bytes: number
}

export interface RefRelinkPlan {
  updates: RefRelinkUpdate[]
  oldToNew: Record<string, string>
  unresolvedKeys: string[]
}

/**
 * 用文件内容指纹恢复已经失效的本地引用路径。
 *
 * 这是外部资源恢复里风险最高的一步：同一张图可能在素材目录里存在多份副本，
 * 自动选择任意一份都可能把角色挂到错误位置。因此这里只在「旧 key 的所有引用
 * 指纹一致，且新目录只有一个同 hash 候选」时给出更新计划，其他情况保持未解决。
 */
export function planRefRelinks(
  refs: readonly RefImageMeta[],
  files: readonly VaultFile[],
  unreadableKeys: readonly string[],
): RefRelinkPlan {
  const refsByKey = new Map<string, RefImageMeta[]>()
  for (const ref of refs) {
    const bucket = refsByKey.get(ref.vaultKey) ?? []
    bucket.push(ref)
    refsByKey.set(ref.vaultKey, bucket)
  }

  const updates: RefRelinkUpdate[] = []
  const oldToNew: Record<string, string> = {}
  const unresolvedKeys: string[] = []

  for (const oldKey of Array.from(new Set(unreadableKeys)).sort()) {
    const keyRefs = refsByKey.get(oldKey) ?? []
    const hashes = new Set(keyRefs.map((ref) => ref.fileHash).filter(Boolean))
    if (keyRefs.length === 0 || hashes.size !== 1) {
      unresolvedKeys.push(oldKey)
      continue
    }

    const fileHash = Array.from(hashes)[0]
    const candidates = files.filter((file) => file.hash === fileHash && file.key !== oldKey)
    if (candidates.length !== 1) {
      unresolvedKeys.push(oldKey)
      continue
    }

    const candidate = candidates[0]
    oldToNew[oldKey] = candidate.key
    for (const ref of keyRefs) {
      updates.push({
        id: ref.id,
        vaultKey: candidate.key,
        fileHash,
        mime: candidate.mime,
        bytes: candidate.size,
      })
    }
  }

  return { updates, oldToNew, unresolvedKeys }
}

/** 把角色/地点当前挂接的旧 key 整体替换成恢复后的新 key，并保持顺序去重。 */
export function applyKeyRelinks(
  groups: Readonly<Record<string, readonly string[]>>,
  oldToNew: Readonly<Record<string, string>>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [owner, keys] of Object.entries(groups)) {
    const next: string[] = []
    for (const key of keys) {
      const mapped = oldToNew[key] ?? key
      if (!next.includes(mapped)) next.push(mapped)
    }
    out[owner] = next
  }
  return out
}
