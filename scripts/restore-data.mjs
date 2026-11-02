import { restoreDataBackup } from "../lib/ops/backup.mjs"

const [backupDir, targetDir] = process.argv.slice(2)
if (!backupDir || !targetDir) {
  console.error("用法：node scripts/restore-data.mjs <备份目录> <新目标目录>")
  process.exit(1)
}

try {
  const result = restoreDataBackup({
    backupDir,
    targetDir,
    confirm: process.env.CHENGJU_RESTORE_CONFIRM === "1",
  })
  console.log(JSON.stringify({ ok: true, directory: result.directory }))
} catch (error) {
  console.error(`[restore] ${error instanceof Error ? error.message : "恢复失败"}`)
  process.exit(1)
}
