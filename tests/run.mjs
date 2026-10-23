import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { cleanupSuiteArtifacts } from "./run-artifacts.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const configuredDataDir = process.env.CHENGJU_DATA_DIR?.trim()
const dataDir = configuredDataDir && configuredDataDir !== "undefined"
  ? configuredDataDir
  : path.join(repoRoot, "data")

const result = spawnSync(
  process.execPath,
  [
    "--import",
    "./tests/register.mjs",
    "--import",
    "./tests/cleanup.mjs",
    "--test",
    "tests/*.test.ts",
  ],
  { cwd: repoRoot, env: process.env, stdio: "inherit" },
)

cleanupSuiteArtifacts(dataDir)

if (result.error) throw result.error
if (result.signal) {
  process.kill(process.pid, result.signal)
} else {
  process.exit(result.status ?? 1)
}
