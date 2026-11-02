import path from "node:path"

import { createDataBackup } from "../lib/ops/backup.mjs"

const dataDir = path.resolve(process.env.CHENGJU_DATA_DIR || "data")
const backupRoot = path.resolve(
  process.env.CHENGJU_BACKUP_DIR || path.join(dataDir, "backups"),
)
const keep = Number(process.env.CHENGJU_BACKUP_KEEP || 7)
const appVersion = process.env.CHENGJU_APP_VERSION || process.env.GIT_COMMIT || ""

try {
  const result = createDataBackup({ dataDir, backupRoot, keep, appVersion })
  console.log(JSON.stringify({
    ok: true,
    directory: result.directory,
    generatedFiles: result.manifest.generatedFiles,
    generatedBytes: result.manifest.generatedBytes,
  }))
} catch (error) {
  console.error(`[backup] ${error instanceof Error ? error.message : "备份失败"}`)
  process.exit(1)
}
