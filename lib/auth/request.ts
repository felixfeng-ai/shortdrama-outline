import type { DatabaseSync } from "node:sqlite"

import type { AuthUser } from "./service.ts"
import { userFromSessionToken } from "./service.ts"
import { ownerFromRequest } from "../session.ts"
import { identityFromRequest } from "../quota.ts"

export const AUTH_COOKIE = "chengju_auth"

export function authTokenFromRequest(req: Request): string {
  const authorization = req.headers.get("authorization")?.trim() ?? ""
  if (authorization.toLowerCase().startsWith("bearer ")) return authorization.slice(7).trim()
  const raw = req.headers.get("cookie") ?? ""
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=")
    if (name === AUTH_COOKIE) return rest.join("=").trim()
  }
  return ""
}

export function currentAuthUser(
  db: DatabaseSync,
  req: Request,
): AuthUser | null {
  return userFromSessionToken(db, authTokenFromRequest(req))
}

export function resolveProjectOwner(db: DatabaseSync, req: Request): string {
  return currentAuthUser(db, req)?.id ?? ownerFromRequest(req)
}

export function resolveRequestIdentity(db: DatabaseSync, req: Request): string {
  return currentAuthUser(db, req)?.id ?? identityFromRequest(req)
}
