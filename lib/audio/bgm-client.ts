import type { BgmTrack } from "./bgm-types.ts"

export async function fetchBgmTracks(projectId: string): Promise<BgmTrack[]> {
  const params = new URLSearchParams({ projectId })
  const response = await fetch(`/api/audio/bgm?${params.toString()}`)
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "BGM 曲库读取失败")
  }
  return payload.data.tracks as BgmTrack[]
}

export async function uploadBgmTrack(input: {
  projectId: string
  file: File
  licenseConfirmed: boolean
  licenseNote?: string
  durationMs?: number
}): Promise<BgmTrack> {
  const form = new FormData()
  form.set("projectId", input.projectId)
  form.set("file", input.file)
  form.set("name", input.file.name)
  form.set("licenseConfirmed", String(input.licenseConfirmed))
  form.set("licenseNote", input.licenseNote ?? "")
  if (input.durationMs) form.set("durationMs", String(input.durationMs))
  const response = await fetch("/api/audio/bgm", { method: "POST", body: form })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || "BGM 上传失败")
  }
  return payload.data.track as BgmTrack
}
