import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("视频生产配置会从 GitHub Actions 注入服务器 .env", () => {
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8")
  const apply = fs.readFileSync("scripts/apply-deploy-env.mjs", "utf8")

  assert.match(workflow, /MINIMAX_API_KEY: \$\{\{ secrets\.MINIMAX_API_KEY \}\}/)
  assert.match(workflow, /VIDEO_GENERATION_ENABLED: "1"/)
  assert.match(workflow, /MINIMAX_VIDEO_MODEL: "MiniMax-H3-Lite"/)
  assert.match(workflow, /MINIMAX_VIDEO_RESOLUTION: "768P"/)
  assert.match(workflow, /envs: .*MINIMAX_API_KEY/)

  for (const key of [
    "MINIMAX_API_KEY",
    "VIDEO_GENERATION_ENABLED",
    "MINIMAX_VIDEO_MODEL",
    "MINIMAX_VIDEO_RESOLUTION",
  ]) {
    assert.ok(apply.includes(`${key}: process.env.${key}`), `服务器配置缺少 ${key}`)
  }
})
