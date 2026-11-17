import type { DatabaseSync } from "node:sqlite"

import { getDbForRequest } from "../assets/store.ts"
import { currentAuthUser } from "../auth/request.ts"
import type { AuthUser } from "../auth/service.ts"
import { requireAdminUser } from "./auth.ts"

export function adminRequestContext(req: Request): {
  db: DatabaseSync
  user: AuthUser
} {
  const db = getDbForRequest()
  const user = requireAdminUser(db, currentAuthUser(db, req))
  return { db, user }
}
