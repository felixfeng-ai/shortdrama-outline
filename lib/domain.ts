export const CANONICAL_HOST = "veyatv.com"
export const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`
export const LEGACY_HOSTS = ["chenju.work", "www.chenju.work"] as const

export function isLegacyHost(hostname: string): boolean {
  return (LEGACY_HOSTS as readonly string[]).includes(hostname.toLowerCase())
}

export function isCanonicalWwwHost(hostname: string): boolean {
  return hostname.toLowerCase() === `www.${CANONICAL_HOST}`
}

/** 只允许站内绝对路径，阻断跨站开放重定向。 */
export function safeInternalPath(value: string | null | undefined, fallback = "/"): string {
  const path = (value ?? "").trim()
  if (!path.startsWith("/") || path.startsWith("//")) return fallback
  if (/[\u0000-\u001f\\]/.test(path)) return fallback
  return path
}

export function canonicalUrl(path: string): URL {
  return new URL(safeInternalPath(path), CANONICAL_ORIGIN)
}
