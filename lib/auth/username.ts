const ADJECTIVES = [
  "青禾",
  "星野",
  "云舟",
  "月白",
  "临风",
  "知夏",
  "长川",
  "山岚",
  "南枝",
  "夜航",
] as const

const ROLES = ["编剧", "导演", "制片", "场记", "光影", "故事"] as const

export const USERNAME_MIN_LENGTH = 2
export const USERNAME_MAX_LENGTH = 16

function hashString(value: string): number {
  let hash = 2_166_136_261
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

export function normalizeUsername(value: unknown): string {
  const username = typeof value === "string"
    ? value.trim().replace(/^@/, "")
    : ""
  const characters = Array.from(username)
  if (
    characters.length < USERNAME_MIN_LENGTH
    || characters.length > USERNAME_MAX_LENGTH
    || !/^[\p{L}\p{N}_-]+$/u.test(username)
  ) {
    throw new Error("用户名需为 2–16 个中英文、数字、下划线或短横线。")
  }
  return username
}

export function isLegacyAutoUsername(value: unknown): boolean {
  const username = typeof value === "string" ? value.trim() : ""
  return !username || username.startsWith("用户")
}

export function generateUsernameCandidate(seed: string, attempt = 0): string {
  const hash = hashString(`${seed}:${attempt}`)
  const adjective = ADJECTIVES[hash % ADJECTIVES.length]
  const role = ROLES[Math.floor(hash / ADJECTIVES.length) % ROLES.length]
  const suffix = attempt > 0 ? String(attempt + 1) : ""
  return `${adjective}${role}${suffix}`
}
