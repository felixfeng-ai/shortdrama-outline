const INTERNAL_BASE = "https://chengju.invalid"

export function safeReturnPath(value: string | null | undefined): string {
  const raw = value?.trim() ?? ""
  if (
    !raw ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    /[\u0000-\u001f]/.test(raw)
  ) {
    return "/"
  }

  try {
    const url = new URL(raw, INTERNAL_BASE)
    if (url.origin !== INTERNAL_BASE) return "/"
    if (url.pathname === "/login" || url.pathname.startsWith("/login/")) return "/"
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return "/"
  }
}
