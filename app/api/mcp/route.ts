import { NextResponse } from "next/server"

import { assertProjectAccess } from "@/lib/assets/access"
import { listProjects } from "@/lib/assets/repo"
import { getDbForRequest } from "@/lib/assets/store"
import { resolveProjectOwner } from "@/lib/auth/request"
import { getProjectSkillBinding } from "@/lib/skills/personal"
import { listProjectBranches } from "@/lib/project-collaboration"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TOOLS = [
  {
    name: "list_projects",
    description: "列出当前已认证创作者拥有的项目，只返回项目摘要。",
    inputSchema: { type: "object", properties: {}, required: [] },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_project_summary",
    description: "读取一个项目的 Skill、分支和基础身份信息；不返回图片、媒体路径或密钥。",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string" } },
      required: ["projectId"],
    },
    annotations: { readOnlyHint: true },
  },
] as const

function rpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result })
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id, error: { code, message } }, { status: 200 })
}

function textResult(value: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    isError: false,
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const id = body?.id ?? null
  const method = typeof body?.method === "string" ? body.method : ""
  if (!method) return rpcError(id, -32600, "Invalid Request")

  try {
    if (method === "initialize") {
      return rpcResult(id, {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "chengju", version: "1.0.0" },
        capabilities: { tools: { listChanged: false } },
      })
    }
    if (method === "tools/list") return rpcResult(id, { tools: TOOLS })
    if (method === "ping") return rpcResult(id, {})
    if (method === "tools/call") {
      const name = String(body?.params?.name ?? "")
      const args = body?.params?.arguments ?? {}
      const db = getDbForRequest()
      const ownerId = resolveProjectOwner(db, req)
      if (name === "list_projects") {
        return rpcResult(id, textResult({
          projects: listProjects(db, ownerId).map((project) => ({
            id: project.id,
            title: project.title,
            updatedAt: project.updatedAt,
          })),
        }))
      }
      if (name === "get_project_summary") {
        const projectId = String(args?.projectId ?? "").trim()
        if (!projectId) return rpcError(id, -32602, "projectId is required")
        const project = assertProjectAccess(db, projectId, ownerId)
        return rpcResult(id, textResult({
          project: { id: project.id, title: project.title, updatedAt: project.updatedAt },
          skill: getProjectSkillBinding(db, projectId),
          branches: listProjectBranches(db, projectId, ownerId).map((branch) => ({
            id: branch.id,
            name: branch.name,
            baseKind: branch.baseKind,
            baseVersion: branch.baseVersion,
            createdAt: branch.createdAt,
          })),
          capabilities: { readOnly: true },
        }))
      }
      return rpcError(id, -32602, `Unknown tool: ${name}`)
    }
    return rpcError(id, -32601, `Method not found: ${method}`)
  } catch (error) {
    return rpcError(id, -32000, error instanceof Error ? error.message : "MCP request failed")
  }
}
