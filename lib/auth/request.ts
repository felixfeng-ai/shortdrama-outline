import type { DatabaseSync } from "node:sqlite"

import type { AuthUser } from "./service.ts"
import {
  authSessionIdForToken,
  userFromAccessToken,
  userFromSessionToken,
} from "./service.ts"
import { ownerFromRequest } from "../session.ts"
import { identityFromRequest } from "../quota.ts"

export const AUTH_COOKIE = "chengju_auth"

export function authTokenSourceFromRequest(req: Request): {
  token: string
  source: "bearer" | "cookie" | null
} {
  const authorization = req.headers.get("authorization")?.trim() ?? ""
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return { token: authorization.slice(7).trim(), source: "bearer" }
  }
  const raw = req.headers.get("cookie") ?? ""
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === AUTH_COOKIE) return { token: rest.join("=").trim(), source: "cookie" }
  }
  return { token: "", source: null }
}

export function authTokenFromRequest(req: Request): string {
  return authTokenSourceFromRequest(req).token
}

export function currentAuthUser(
  db: DatabaseSync,
  req: Request,
): AuthUser | null {
  const { token, source } = authTokenSourceFromRequest(req)
  if (source === "bearer") {
    return token.startsWith("cj1.") ? userFromAccessToken(db, token) : null
  }
  if (source === "cookie") {
    return token.startsWith("cj1.") ? null : userFromSessionToken(db, token)
  }
  return null
}

export function currentSessionId(req: Request): string | null {
  return authSessionIdForToken(authTokenFromRequest(req))
}

export function resolveProjectOwner(db: DatabaseSync, req: Request): string {
  return currentAuthUser(db, req)?.id ?? ownerFromRequest(req)
}

export function resolveRequestIdentity(db: DatabaseSync, req: Request): string {
  return currentAuthUser(db, req)?.id ?? identityFromRequest(req)
}
