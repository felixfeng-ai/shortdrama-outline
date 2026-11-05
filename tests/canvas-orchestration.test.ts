import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import {
  addCanvasNode,
  CanvasGraphError,
  connectCanvasNodes,
  createDefaultCanvasGraph,
  moveCanvasNode,
  removeCanvasNode,
  updateCanvasNode,
  validateCanvasGraph,
} from "../lib/canvas-graph.ts"
import {
  CanvasGraphConflictError,
  loadCanvasGraph,
  saveCanvasGraph,
} from "../lib/canvas-graph-repo.ts"
import {
  GET as getCanvasGraph,
  PUT as putCanvasGraph,
} from "../app/api/projects/[id]/canvas-graph/route.ts"
import { createProject } from "../lib/assets/repo.ts"
import { __resetDbForTests, getDbForRequest } from "../lib/assets/store.ts"

const owner = `anon_${"c".repeat(48)}`

function request(pathname: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (!headers.has("cookie")) headers.set("cookie", `chengju_sid=${owner}`)
  if (init.body) headers.set("content-type", "application/json")
  return new Request(`http://localhost${pathname}`, { ...init, headers })
}

function seedProject() {
  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = createProject(db, "编排画布项目", owner)
  return { db, project }
}

test("CV1 默认图来自七类真实制作节点与稳定依赖", () => {
  const graph = createDefaultCanvasGraph()
  assert.equal(graph.nodes.length, 7)
  assert.ok(graph.nodes.every((node) => node.type === "step" && node.system))
  assert.deepEqual(
    graph.nodes.map((node) => node.step),
    ["characters", "acts", "episodes", "visuals", "scenes", "places", "shots"],
  )
  assert.ok(graph.edges.some((edge) => edge.from === "step-visuals" && edge.to === "step-shots"))
  assert.equal(new Set(graph.edges.map((edge) => `${edge.from}:${edge.to}`)).size, graph.edges.length)
})

test("CV1 可新增人工节点并编辑正文，系统节点不可重复新增", () => {
  let graph = createDefaultCanvasGraph()
  graph = addCanvasNode(graph, "note", {
    id: "note-1",
    title: "雨夜钩子",
    x: 120,
    y: 480,
  })
  graph = updateCanvasNode(graph, "note-1", { body: "片头先给便利店最后一盏灯。" })
  assert.equal(graph.nodes.find((node) => node.id === "note-1")?.body, "片头先给便利店最后一盏灯。")
  assert.equal(graph.nodes.find((node) => node.id === "note-1")?.system, false)
  assert.throws(
    () => addCanvasNode(graph, "step"),
    (error) => error instanceof CanvasGraphError && error.code === "invalid-type",
  )
})

test("CV2 连线拒绝自连与重复边，并只删除自定义节点", () => {
  let graph = addCanvasNode(createDefaultCanvasGraph(), "decision", {
    id: "decision-1",
    title: "是否让主角先撒谎",
    x: 400,
    y: 470,
  })
  graph = connectCanvasNodes(graph, "decision-1", "step-acts")
  assert.ok(graph.edges.some((edge) => edge.from === "decision-1" && edge.to === "step-acts"))
  assert.throws(
    () => connectCanvasNodes(graph, "decision-1", "step-acts"),
    (error) => error instanceof CanvasGraphError && error.code === "duplicate-edge",
  )
  assert.throws(
    () => connectCanvasNodes(graph, "decision-1", "decision-1"),
    (error) => error instanceof CanvasGraphError && error.code === "self-edge",
  )

  graph = removeCanvasNode(graph, "decision-1")
  assert.equal(graph.nodes.some((node) => node.id === "decision-1"), false)
  assert.equal(graph.edges.some((edge) => edge.from === "decision-1"), false)
  assert.throws(
    () => removeCanvasNode(graph, "step-shots"),
    (error) => error instanceof CanvasGraphError && error.code === "system-node",
  )
})

test("CV2 移动节点保持 revision 不变，并校验悬空边与坐标", () => {
  let graph = createDefaultCanvasGraph()
  graph = moveCanvasNode(graph, "step-shots", 1210.5, 90.25)
  assert.equal(graph.nodes.find((node) => node.id === "step-shots")?.x, 1210.5)
  assert.equal(graph.revision, 0)

  const invalid = {
    ...graph,
    edges: [...graph.edges, { id: "bad", from: "missing", to: "step-shots" }],
  }
  assert.throws(
    () => validateCanvasGraph(invalid),
    (error) => error instanceof CanvasGraphError && error.code === "dangling-edge",
  )

  const invalidPosition = {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === "step-shots" ? { ...node, x: Number.NaN } : node
    ),
  }
  assert.throws(
    () => validateCanvasGraph(invalidPosition),
    (error) => error instanceof CanvasGraphError && error.code === "invalid-node",
  )
})

test("CV3 服务端自动递增 revision，过期写入返回最新图", () => {
  const { db, project } = seedProject()
  const initial = createDefaultCanvasGraph()
  const first = saveCanvasGraph(db, project.id, owner, initial, 0)
  assert.equal(first.graph.revision, 1)
  assert.equal(first.graph.updatedBy, owner)

  const withNote = addCanvasNode(first.graph, "note", { id: "note-2", title: "新增备注" })
  const second = saveCanvasGraph(db, project.id, owner, withNote, 1)
  assert.equal(second.graph.revision, 2)
  assert.equal(loadCanvasGraph(db, project.id)?.graph.revision, 2)

  const stale = addCanvasNode(second.graph, "deliverable", { id: "out-1", title: "交付节点" })
  assert.throws(
    () => saveCanvasGraph(db, project.id, owner, stale, 1),
    (error) => error instanceof CanvasGraphConflictError
      && error.latest?.graph.revision === 2,
  )
})

test("CV3/CV4 API 保存、读取、隔离 owner 并返回 409", async () => {
  const { project } = seedProject()
  const initial = createDefaultCanvasGraph()
  const saved = await putCanvasGraph(
    request(`/api/projects/${project.id}/canvas-graph`, {
      method: "PUT",
      body: JSON.stringify({ graph: initial, expectedRevision: 0 }),
    }),
    { params: { id: project.id } },
  )
  assert.equal(saved.status, 200)
  const savedBody = await saved.json()
  assert.equal(savedBody.data.graph.revision, 1)

  const loaded = await getCanvasGraph(
    request(`/api/projects/${project.id}/canvas-graph`),
    { params: { id: project.id } },
  )
  assert.equal((await loaded.json()).data.graph.revision, 1)

  const conflict = await putCanvasGraph(
    request(`/api/projects/${project.id}/canvas-graph`, {
      method: "PUT",
      body: JSON.stringify({ graph: initial, expectedRevision: 0 }),
    }),
    { params: { id: project.id } },
  )
  assert.equal(conflict.status, 409)
  assert.equal((await conflict.json()).data.latest.graph.revision, 1)

  const denied = await getCanvasGraph(
    request(`/api/projects/${project.id}/canvas-graph`, {
      headers: { cookie: `chengju_sid=anon_${"z".repeat(48)}` },
    }),
    { params: { id: project.id } },
  )
  assert.equal(denied.status, 403)
})

test("CV1-CV4 画布接入编排视图、BroadcastChannel 和移动端布局", () => {
  const projectCanvas = fs.readFileSync("components/ProjectCanvas.tsx", "utf8")
  const workspace = fs.existsSync("components/CanvasGraphWorkspace.tsx")
    ? fs.readFileSync("components/CanvasGraphWorkspace.tsx", "utf8")
    : ""
  const canvasClient = fs.readFileSync("lib/canvas-graph-client.ts", "utf8")
  const css = fs.readFileSync("app/globals.css", "utf8")

  assert.match(projectCanvas, /编排画布/)
  assert.match(projectCanvas, /CanvasGraphWorkspace/)
  assert.match(workspace, /BroadcastChannel/)
  assert.match(canvasClient, /expectedRevision/)
  assert.match(workspace, /连接节点/)
  assert.match(workspace, /删除节点/)
  assert.match(workspace, /canvas-graph-node/)
  assert.match(css, /\.canvas-graph-workspace/)
  assert.match(css, /\.canvas-graph-node/)
  assert.match(css, /@media \(max-width: 760px\)/)
})
