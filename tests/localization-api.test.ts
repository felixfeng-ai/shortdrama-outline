import { test } from "node:test"
import assert from "node:assert/strict"

import {
  GET as getBranches,
  POST as postBranch,
} from "../app/api/projects/[id]/localization/branches/route.ts"
import {
  GET as getContext,
  PUT as putContext,
} from "../app/api/projects/[id]/localization/branches/[branchId]/context/route.ts"
import {
  GET as getGlossary,
  PUT as putGlossary,
} from "../app/api/projects/[id]/localization/branches/[branchId]/glossary/route.ts"
import { POST as postAudit } from "../app/api/projects/[id]/localization/branches/[branchId]/audit/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const owner = `anon_${"q".repeat(48)}`

function request(pathname: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (!headers.has("cookie")) headers.set("cookie", `chengju_sid=${owner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

function projectContext(id: string) {
  return { params: { id } }
}

function branchContext(id: string, branchId: string) {
  return { params: { id, branchId } }
}

async function seedBranch() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "本地化 API", owner)
  const snapshot = createSnapshot(db, {
    projectId: project.id,
    kind: "episodes",
    payload: [{
      id: "ep-1",
      number: 1,
      title: "雨夜",
      synopsis: "林远走进旧报社。",
      hook: "电话响了。",
    }],
  })
  const response = await postBranch(
    request(`/api/projects/${project.id}/localization/branches`, {
      method: "POST",
      body: JSON.stringify({
        name: "English",
        baseSnapshotId: snapshot.id,
        market: "US",
        locale: "en-US",
      }),
    }),
    projectContext(project.id),
  )
  assert.equal(response.status, 200)
  const branch = (await response.json()).data.branch
  return { db, project, snapshot, branch }
}

test("LAPI1 创建海外分支，并保存、读取市场上下文与术语", async () => {
  const { project, branch } = await seedBranch()

  const listed = await getBranches(
    request(`/api/projects/${project.id}/localization/branches`),
    projectContext(project.id),
  )
  assert.equal(listed.status, 200)
  assert.equal((await listed.json()).data.branches.length, 1)

  const contextResponse = await putContext(
    request(`/api/projects/${project.id}/localization/branches/${branch.id}/context`, {
      method: "PUT",
      body: JSON.stringify({
        marketCode: "en-US",
        platforms: ["TikTok"],
        adaptationBrief: { audience: "US women 25-35" },
      }),
    }),
    branchContext(project.id, branch.id),
  )
  assert.equal(contextResponse.status, 200)
  const context = (await contextResponse.json()).data.context
  assert.equal(context.version, 1)

  const glossaryResponse = await putGlossary(
    request(`/api/projects/${project.id}/localization/branches/${branch.id}/glossary`, {
      method: "PUT",
      body: JSON.stringify({
        source: "林远",
        target: "Lin Yuan",
        kind: "person",
        locked: true,
      }),
    }),
    branchContext(project.id, branch.id),
  )
  assert.equal(glossaryResponse.status, 200)

  const glossary = await getGlossary(
    request(`/api/projects/${project.id}/localization/branches/${branch.id}/glossary`),
    branchContext(project.id, branch.id),
  )
  assert.equal((await glossary.json()).data.glossary[0].target, "Lin Yuan")

  const readContext = await getContext(
    request(`/api/projects/${project.id}/localization/branches/${branch.id}/context`),
    branchContext(project.id, branch.id),
  )
  assert.equal((await readContext.json()).data.context.profile.locale, "en-US")
})

test("LAPI2 审计接口只保存文本报告，并返回 blocking/warning", async () => {
  const { project, snapshot, branch } = await seedBranch()
  await putContext(
    request(`/api/projects/${project.id}/localization/branches/${branch.id}/context`, {
      method: "PUT",
      body: JSON.stringify({
        marketCode: "en-US",
        subtitle: { maxLineChars: 30, maxCps: 17 },
        adaptationBrief: { redlines: ["underage romance"] },
      }),
    }),
    branchContext(project.id, branch.id),
  )
  await putGlossary(
    request(`/api/projects/${project.id}/localization/branches/${branch.id}/glossary`, {
      method: "PUT",
      body: JSON.stringify({ source: "林远", target: "Lin Yuan", locked: true }),
    }),
    branchContext(project.id, branch.id),
  )

  const response = await postAudit(
    request(`/api/projects/${project.id}/localization/branches/${branch.id}/audit`, {
      method: "POST",
      body: JSON.stringify({
        sourceSnapshotId: snapshot.id,
        items: [{
          episode: 1,
          title: "The Office",
          localized: "Lin enters underage romance in a line that is too long for subtitle.",
          hook: "The phone rings.",
          source: "林远走进旧报社。",
          reason: "测试",
          glossaryUsed: [],
          risks: [],
        }],
      }),
    }),
    branchContext(project.id, branch.id),
  )
  assert.equal(response.status, 200)
  const report = (await response.json()).data.audit
  assert.ok(report.blocking >= 2)
  assert.ok(report.warning >= 1)
})
