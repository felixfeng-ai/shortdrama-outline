export interface BgmTrack {
  id: string
  projectId: string
  name: string
  storageKey: string
  mime: string
  bytes: number
  durationMs: number | null
  sha256: string
  licenseConfirmed: boolean
  licenseNote: string
  createdAt: number
}
