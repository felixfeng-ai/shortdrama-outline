import type { DatabaseSync } from "node:sqlite"

import {
  claimNextDeliveryPackage,
  recoverInterruptedDeliveryPackages,
} from "./repo.ts"
import { buildDeliveryPackage } from "./service.ts"

let draining = false
let rerunRequested = false
const recoveredDatabases = new WeakSet<DatabaseSync>()

export async function drainDeliveryPackageQueue(db: DatabaseSync): Promise<void> {
  if (!recoveredDatabases.has(db)) {
    recoveredDatabases.add(db)
    recoverInterruptedDeliveryPackages(db)
  }
  if (draining) {
    rerunRequested = true
    return
  }
  draining = true
  try {
    do {
      rerunRequested = false
      while (true) {
        const pkg = claimNextDeliveryPackage(db)
        if (!pkg) break
        await buildDeliveryPackage(db, pkg.id)
      }
    } while (rerunRequested)
  } finally {
    draining = false
  }
}

export function scheduleDeliveryPackageQueue(db: DatabaseSync): void {
  void drainDeliveryPackageQueue(db).catch((error) => {
    console.error("[delivery-package] 队列执行失败", error)
  })
}
