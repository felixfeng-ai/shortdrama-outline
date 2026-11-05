import { renderArtifactResponse } from "@/lib/video/render-http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type RouteContext = { params: { id: string } | Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  const params = await context.params
  return renderArtifactResponse(req, params.id, "srt")
}
