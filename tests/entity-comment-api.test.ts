import { test } from "node:test"
import assert from "node:assert/strict"

import {
  GET as getComments,
  POST as postComment,
} from "../app/api/projects/[id]/comments/route.ts"
import { PATCH as patchComment } from "../app/api/projects/[id]/comments/[commentId]/route.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const owner = `anon_${"e".repeat(48)}`

function request(pathname: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (!headers.has("cookie")) headers.set("cookie", `chengju_sid=${owner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

function projectContext(id: string) {
  return { params: { id } }
}

function commentContext(id: string, commentId: string) {
  return { params: { id, commentId } }
}

function seedProject() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "批注 API 项目", owner)
  createSnapshot(db, {
    projectId: project.id,
    kind: "shots",
    payload: [{
      id: "shot-row",
      entityId: "shot-stable",
      episode: 1,
      shot: 2,
      scene: "旧车站",
    }],
  })
  return project
}

test("ECA1 API 创建、筛选并解决实体批注", async () => {
  const project = seedProject()
  const created = await postComment(
    request(`/api/projects/${project.id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        targetType: "shot",
        targetId: "shot-stable",
        body: "这一镜先留空镜，不要提前给人物正脸。",
      }),
    }),
    projectContext(project.id),
  )
  assert.equal(created.status, 200)
  const comment = (await created.json()).data.comment
  assert.equal(comment.targetName, "旧车站")

  const listed = await getComments(
    request(`/api/projects/${project.id}/comments?targetType=shot&targetId=shot-stable`),
    projectContext(project.id),
  )
  assert.equal(listed.status, 200)
  assert.equal((await listed.json()).data.comments.length, 1)

  const resolved = await patchComment(
    request(`/api/projects/${project.id}/comments/${comment.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
    }),
    commentContext(project.id, comment.id),
  )
  assert.equal(resolved.status, 200)
  assert.equal((await resolved.json()).data.comment.status, "resolved")
})

test("ECA2 无权限项目不能读评论", async () => {
  const project = seedProject()
  const response = await getComments(
    request(`/api/projects/${project.id}/comments`, {
      headers: { cookie: `chengju_sid=anon_${"z".repeat(48)}` },
    }),
    projectContext(project.id),
  )
  assert.equal(response.status, 403)
})

test("ECA3 视频时间码与 Take 元数据通过项目批注接口持久化", async () => {
  const project = seedProject()
  const timecode = await postComment(
    request(`/api/projects/${project.id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        targetType: "shot",
        targetId: "shot-stable",
        body: "眼神再停半拍",
        kind: "timecode",
        timecodeMs: 5400,
        frameMarked: true,
      }),
    }),
    projectContext(project.id),
  )
  assert.equal(timecode.status, 200)
  const timecodeComment = (await timecode.json()).data.comment
  assert.equal(timecodeComment.kind, "timecode")
  assert.equal(timecodeComment.timecodeMs, 5400)
  assert.equal(timecodeComment.frameMarked, true)

  const take = await postComment(
    request(`/api/projects/${project.id}/comments`, {
      method: "POST",
      body: JSON.stringify({
        targetType: "shot",
        targetId: "shot-stable",
        body: "这一条表演最好",
        kind: "take",
        isBest: true,
        continuityStatus: "passed",
        continuitySummary: "与 Canon 一致",
        continuityIssueCount: 0,
      }),
    }),
    projectContext(project.id),
  )
  assert.equal(take.status, 200)
  const takeComment = (await take.json()).data.comment
  assert.equal(takeComment.kind, "take")
  assert.equal(takeComment.isBest, true)
  assert.equal(takeComment.continuityStatus, "passed")
})
