import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

import { safeInternalPath } from "../domain.ts"

export interface DomainHandoffPayload {
  anonymousSession?: string
  authToken?: string
  returnTo: string
  expiresAt: number
}

const TOKEN_VERSION = "v1"
const TOKEN_TTL_MS = 5 * 60 * 1000

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(`veyatv-domain-handoff:${secret}`).digest()
}

function encode(buffer: Buffer): string {
  return buffer.toString("base64url")
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url")
}

/**
 * 跨域 Cookie 不会随跳转发送，因此只把旧域会话装进 5 分钟有效的
 * AES-GCM 密文 token。新域消费 token 后立即写入本域 Cookie。
 */
export function createDomainHandoffToken(
  input: Omit<DomainHandoffPayload, "expiresAt">,
  secret: string,
  now = Date.now(),
): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv)
  const payload: DomainHandoffPayload = {
    anonymousSession: input.anonymousSession || undefined,
    authToken: input.authToken || undefined,
    returnTo: safeInternalPath(input.returnTo),
    expiresAt: now + TOKEN_TTL_MS,
  }
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [TOKEN_VERSION, encode(iv), encode(tag), encode(ciphertext)].join(".")
}

export function readDomainHandoffToken(
  token: string | null | undefined,
  secret: string,
  now = Date.now(),
): DomainHandoffPayload | null {
  if (!token) return null
  try {
    const [version, ivValue, tagValue, ciphertextValue] = token.split(".")
    if (version !== TOKEN_VERSION || !ivValue || !tagValue || !ciphertextValue) return null
    const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), decode(ivValue))
    decipher.setAuthTag(decode(tagValue))
    const plaintext = Buffer.concat([
      decipher.update(decode(ciphertextValue)),
      decipher.final(),
    ]).toString("utf8")
    const payload = JSON.parse(plaintext) as DomainHandoffPayload
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt < now) return null
    return {
      anonymousSession: typeof payload.anonymousSession === "string"
        ? payload.anonymousSession
        : undefined,
      authToken: typeof payload.authToken === "string" ? payload.authToken : undefined,
      returnTo: safeInternalPath(payload.returnTo),
      expiresAt: payload.expiresAt,
    }
  } catch {
    return null
  }
}
