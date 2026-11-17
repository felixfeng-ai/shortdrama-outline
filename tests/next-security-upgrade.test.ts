import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("Next.js 固定到安全补丁版本并启用安全升级标记", () => {
  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    dependencies: Record<string, string>
  }
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as {
    packages: Record<string, { version?: string }>
  }
  const nextConfig = fs.readFileSync("next.config.mjs", "utf8")

  assert.equal(packageJson.dependencies.next, "16.4.6")
  assert.equal(lock.packages["node_modules/next"]?.version, "16.4.6")
  assert.match(nextConfig, /agentUpgrade:\s*["']security["']/)
})
