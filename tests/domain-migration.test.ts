import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { NextRequest } from "next/server"

import {
  createDomainHandoffToken,
  readDomainHandoffToken,
} from "../lib/auth/domain-handoff.ts"
import { proxy } from "../proxy.ts"
import { checkProductionReadiness } from "../lib/ops/readiness.ts"
import { GET as startDomainHandoff } from "../app/api/domain-migration/start/route.ts"
import { GET as completeDomainHandoff } from "../app/api/domain-migration/complete/route.ts"
import { AUTH_COOKIE } from "../lib/auth/request.ts"
import { makeSessionId, SESSION_COOKIE } from "../lib/session.ts"

const layout = fs.readFileSync("app/layout.tsx", "utf8")
const sitemap = fs.readFileSync("app/sitemap.ts", "utf8")
const robots = fs.readFileSync("public/robots.txt", "utf8")
const appDownload = fs.readFileSync("components/AppDownloadDialog.tsx", "utf8")
const proxySource = fs.readFileSync("proxy.ts", "utf8")
const deployEnv = fs.readFileSync("scripts/apply-deploy-env.mjs", "utf8")
const workflow = fs.readFileSync(".github/workflows/deploy.yml", "utf8")

test("DOMAIN1 新域成为 canonical，旧域不再作为默认站点", () => {
  assert.match(layout, /CHENGJU_SITE_URL \|\| 'https:\/\/veyatv\.com'/)
  assert.match(sitemap, /CHENGJU_SITE_URL \|\| 'https:\/\/veyatv\.com'/)
  assert.match(robots, /Sitemap: https:\/\/veyatv\.com\/sitemap\.xml/)
  assert.match(appDownload, /https:\/\/veyatv\.com\/app\/download\/android/)
})

test("DOMAIN2 旧域导航通过一次性会话交接后进入新域", () => {
  assert.match(proxySource, /domain-migration/)
  assert.match(proxySource, /isLegacyHost/)
  assert.match(proxySource, /CANONICAL_ORIGIN/)
  assert.ok(fs.existsSync("lib/auth/domain-handoff.ts"))
  assert.ok(fs.existsSync("app/api/domain-migration/start/route.ts"))
  assert.ok(fs.existsSync("app/api/domain-migration/complete/route.ts"))
})

test("DOMAIN3 部署环境同时允许新旧域并声明 canonical", () => {
  assert.match(deployEnv, /CHENGJU_SITE_URL:\s*process\.env\.CHENGJU_SITE_URL/)
  assert.match(deployEnv, /CHENGJU_ALLOWED_ORIGINS:\s*process\.env\.CHENGJU_ALLOWED_ORIGINS/)
  assert.match(deployEnv, /CHENGJU_DOMAIN_MIGRATION_ENABLED:\s*process\.env\.CHENGJU_DOMAIN_MIGRATION_ENABLED/)
  assert.match(workflow, /CHENGJU_SITE_URL:\s*"https:\/\/veyatv\.com"/)
  assert.match(workflow, /CHENGJU_ALLOWED_ORIGINS:\s*"https:\/\/veyatv\.com,https:\/\/www\.veyatv\.com,https:\/\/chenju\.work,https:\/\/www\.chenju\.work"/)
  assert.match(workflow, /CHENGJU_DOMAIN_MIGRATION_ENABLED:\s*"1"/)
})

test("DOMAIN4 Nginx 新域与旧域重定向配置完整", () => {
  const nginxPath = "deploy/nginx-veyatv.com.conf"
  assert.ok(fs.existsSync(nginxPath))
  const nginx = fs.readFileSync(nginxPath, "utf8")
  assert.match(nginx, /server_name veyatv\.com;/)
  assert.match(nginx, /server_name www\.veyatv\.com;/)
  assert.match(nginx, /server_name chenju\.work www\.chenju\.work;/)
  assert.match(nginx, /return 301 https:\/\/veyatv\.com\$request_uri;/)
  assert.match(nginx, /proxy_pass http:\/\/127\.0\.0\.1:3001;/)
})

test("DOMAIN5 handoff token 可解密且拒绝篡改与过期", () => {
  const now = 1_800_000_000_000
  const token = createDomainHandoffToken({
    anonymousSession: "anon_domain_migration",
    authToken: "auth_token",
    returnTo: "/?project=abc",
  }, "test-secret", now)
  assert.deepEqual(readDomainHandoffToken(token, "test-secret", now + 1000), {
    anonymousSession: "anon_domain_migration",
    authToken: "auth_token",
    returnTo: "/?project=abc",
    expiresAt: now + 5 * 60 * 1000,
  })
  assert.equal(readDomainHandoffToken(`${token}x`, "test-secret", now + 1000), null)
  assert.equal(readDomainHandoffToken(token, "wrong-secret", now + 1000), null)
  assert.equal(readDomainHandoffToken(token, "test-secret", now + 6 * 60 * 1000), null)
})

test("DOMAIN6 旧域导航进入交接，旧 API 与 www 新域直接重定向", () => {
  const original = process.env.CHENGJU_DOMAIN_MIGRATION_ENABLED
  process.env.CHENGJU_DOMAIN_MIGRATION_ENABLED = "1"
  try {
    const navigation = proxy(new NextRequest("http://localhost/docs?from=old", {
      headers: {
        host: "chenju.work",
        "x-forwarded-proto": "https",
        accept: "text/html",
        "sec-fetch-mode": "navigate",
      },
    }))
    assert.equal(navigation.status, 307)
    assert.equal(
      navigation.headers.get("location"),
      "https://chenju.work/api/domain-migration/start?returnTo=%2Fdocs%3Ffrom%3Dold",
    )

    const api = proxy(new NextRequest("http://localhost/api/projects", {
      headers: {
        host: "chenju.work",
        "x-forwarded-proto": "https",
        accept: "application/json",
      },
    }))
    assert.equal(api.status, 308)
    assert.equal(api.headers.get("location"), "https://veyatv.com/api/projects")

    const www = proxy(new NextRequest("https://www.veyatv.com/docs", {
      headers: { host: "www.veyatv.com" },
    }))
    assert.equal(www.status, 301)
    assert.equal(www.headers.get("location"), "https://veyatv.com/docs")
  } finally {
    if (original === undefined) delete process.env.CHENGJU_DOMAIN_MIGRATION_ENABLED
    else process.env.CHENGJU_DOMAIN_MIGRATION_ENABLED = original
  }
})

test("DOMAIN7 生产检查拒绝把旧域继续作为 canonical", () => {
  const base = {
    DEEPSEEK_API_KEY: "x",
    ALIYUN_DASHSCOPE_API_KEY: "x",
    AUTH_SECRET: "x".repeat(32),
    AUTH_ALLOW_DEV_CODE: "0",
    RESEND_API_KEY: "re_test",
    AUTH_EMAIL_FROM: "VeyaTV · 成剧 <login@chenju.work>",
    VIDEO_GENERATION_ENABLED: "1",
    MINIMAX_API_KEY: "x",
    TTS_ENABLED: "0",
  }
  const correct = checkProductionReadiness({
    ...base,
    CHENGJU_SITE_URL: "https://veyatv.com",
    CHENGJU_ALLOWED_ORIGINS: "https://veyatv.com,https://chenju.work",
  })
  assert.equal(correct.errors.some((item) => item.includes("CHENGJU_SITE_URL")), false)

  const invalid = checkProductionReadiness({
    ...base,
    CHENGJU_SITE_URL: "https://chenju.work",
    CHENGJU_ALLOWED_ORIGINS: "https://chenju.work",
  })
  assert.ok(invalid.errors.some((item) => item.includes("veyatv.com")))
})

test("DOMAIN8 旧域 Cookie 可完成到新域的一次性交接", async () => {
  const secret = "domain-handoff-integration-secret"
  const original = process.env.AUTH_SECRET
  process.env.AUTH_SECRET = secret
  try {
    const anonymous = makeSessionId()
    const start = await startDomainHandoff(new NextRequest(
      "https://chenju.work/api/domain-migration/start?returnTo=%2Fdocs%3Ftab%3D1",
      {
        headers: {
          cookie: `${SESSION_COOKIE}=${anonymous}; ${AUTH_COOKIE}=auth_session_token`,
        },
      },
    ))
    assert.equal(start.status, 307)
    const completeURL = new URL(start.headers.get("location")!)
    assert.equal(completeURL.origin, "https://veyatv.com")
    const payload = readDomainHandoffToken(completeURL.searchParams.get("token"), secret)
    assert.equal(payload?.anonymousSession, anonymous)
    assert.equal(payload?.authToken, "auth_session_token")
    assert.equal(payload?.returnTo, "/docs?tab=1")

    const complete = await completeDomainHandoff(new NextRequest(completeURL))
    assert.equal(complete.status, 303)
    assert.equal(complete.headers.get("location"), "https://veyatv.com/docs?tab=1")
    const cookies = complete.headers.get("set-cookie") ?? ""
    assert.match(cookies, new RegExp(`${SESSION_COOKIE}=${anonymous}`))
    assert.match(cookies, new RegExp(`${AUTH_COOKIE}=auth_session_token`))
  } finally {
    if (original === undefined) delete process.env.AUTH_SECRET
    else process.env.AUTH_SECRET = original
  }
})

test("DOMAIN9 迁移开关关闭时旧域继续正常服务", () => {
  const original = process.env.CHENGJU_DOMAIN_MIGRATION_ENABLED
  delete process.env.CHENGJU_DOMAIN_MIGRATION_ENABLED
  try {
    const response = proxy(new NextRequest("http://localhost/docs", {
      headers: {
        host: "chenju.work",
        "x-forwarded-proto": "https",
        accept: "text/html",
        "sec-fetch-mode": "navigate",
      },
    }))
    assert.equal(response.headers.get("location"), null)
  } finally {
    if (original !== undefined) process.env.CHENGJU_DOMAIN_MIGRATION_ENABLED = original
  }
})
