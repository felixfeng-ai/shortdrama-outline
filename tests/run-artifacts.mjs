import fs from "node:fs"
import path from "node:path"

export function cleanupSuiteArtifacts(dataDir) {
  const tmp = path.join(dataDir, "tmp")
  if (!fs.existsSync(tmp)) return

  const tempDatabase = /^(?:test|t)-.+-\d+-\d+\.db(?:-(?:wal|shm))?$/
  for (const entry of fs.readdirSync(tmp, { withFileTypes: true })) {
    const target = path.join(tmp, entry.name)
    const generatedDirectory = entry.isDirectory()
      && (entry.name.startsWith("generated-") || entry.name.startsWith("test-isolation-"))
    if (generatedDirectory || (entry.isFile() && tempDatabase.test(entry.name))) {
      fs.rmSync(target, { recursive: entry.isDirectory(), force: true })
    }
  }
}
