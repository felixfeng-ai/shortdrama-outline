import { test } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"

import { middleware } from "../middleware.ts"
import {
  isSessionId,
  LOCAL_SESSION_ID,
  makeSessionId,
  ownerFromRequest,
  SESSION_COOKIE,
} from "../lib/session.ts"

test("匿名会话：生成高熵 token，并能从 Cookie 还原 owner", () => {
  const id = makeSessionId()
  assert.equal(isSessionId(id), true)
  const req = new Request("http://localhost/api/projects", {
    headers: { cookie: `${SESSION_COOKIE}=${id}` },
  })
  assert.equal(ownerFromRequest(req), id)
})

test("匿名会话：非法 Cookie 不被当成 owner", () => {
  const req = new Request("http://localhost/api/projects", {
    headers: { cookie: `${SESSION_COOKIE}=forged` },
  })
  assert.equal(ownerFromRequest(req), "local")
})

test("middleware：无会话时设置 HttpOnly、Lax Cookie，有效会话不重复设置", () => {
  const first = middleware(new NextRequest("https://example.com/"))
  const setCookie = first.headers.get("set-cookie") ?? ""
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE}=anon_`))
  assert.match(setCookie, /HttpOnly/i)
  assert.match(setCookie, /SameSite=lax/i)
  assert.match(setCookie, /Secure/i)

  const id = makeSessionId()
  const valid = middleware(new NextRequest("https://example.com/", {
    headers: { cookie: `${SESSION_COOKIE}=${id}` },
  }))
  assert.equal(valid.headers.get("set-cookie"), null)
})

test("middleware：localhost 使用稳定开发会话，避免本地项目因浏览器上下文变化丢失", () => {
  const first = middleware(new NextRequest("http://localhost/"))
  assert.match(first.headers.get("set-cookie") ?? "", new RegExp(`${SESSION_COOKIE}=${LOCAL_SESSION_ID}`))
  const valid = middleware(new NextRequest("http://localhost/", {
    headers: { cookie: `${SESSION_COOKIE}=${LOCAL_SESSION_ID}` },
  }))
  assert.equal(valid.headers.get("set-cookie"), null)
})

test("middleware：反向代理到 localhost 时仍按生产域名生成独立会话", () => {
  const first = middleware(new NextRequest("http://localhost/", {
    headers: {
      host: "chenju.work",
      "x-forwarded-host": "chenju.work",
      "x-forwarded-proto": "https",
    },
  }))
  const setCookie = first.headers.get("set-cookie") ?? ""
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE}=anon_`))
  assert.doesNotMatch(setCookie, new RegExp(LOCAL_SESSION_ID))
  assert.match(setCookie, /Secure/i)
})

test("middleware：生产环境持有旧开发会话时自动替换，不能继续共享 owner", () => {
  const response = middleware(new NextRequest("http://localhost/", {
    headers: {
      host: "chenju.work",
      "x-forwarded-proto": "https",
      cookie: `${SESSION_COOKIE}=${LOCAL_SESSION_ID}`,
    },
  }))
  const setCookie = response.headers.get("set-cookie") ?? ""
  assert.match(setCookie, new RegExp(`${SESSION_COOKIE}=anon_`))
  assert.doesNotMatch(setCookie, new RegExp(LOCAL_SESSION_ID))
})

test("middleware：生产环境已有的独立会话保持不变", () => {
  const id = makeSessionId()
  const response = middleware(new NextRequest("http://localhost/", {
    headers: {
      host: "chenju.work",
      "x-forwarded-proto": "https",
      cookie: `${SESSION_COOKIE}=${id}`,
    },
  }))
  assert.equal(response.headers.get("set-cookie"), null)
})
