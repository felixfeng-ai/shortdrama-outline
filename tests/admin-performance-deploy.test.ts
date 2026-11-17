import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

test("管理后台与发布版本通过环境变量配置", () => {
  const env = fs.readFileSync(".env.example", "utf8")
  const deploy = fs.readFileSync("deploy/cicd-deploy.sh", "utf8")
  const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8")
  assert.match(env, /^ADMIN_EMAILS=/m)
  assert.match(env, /^CHENGJU_RELEASE=/m)
  assert.match(deploy, /git rev-parse --short HEAD/)
  assert.match(deploy, /export CHENGJU_RELEASE=/)
  assert.match(workflow, /ADMIN_EMAILS:\s*"siyuanfeng-yx@qq\.com"/)
  assert.match(workflow, /envs:.*ADMIN_EMAILS/)
})

test("Nginx 直接提供不可变静态资源并启用预压缩文件", () => {
  const nginx = fs.readFileSync("deploy/nginx-veyatv.com.conf", "utf8")
  assert.match(nginx, /alias \/opt\/chengju\/\.next\/static\//)
  assert.match(nginx, /gzip_static on/)
  assert.match(nginx, /Cache-Control "public, max-age=31536000, immutable"/)
})
