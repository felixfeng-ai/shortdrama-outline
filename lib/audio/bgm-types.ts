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
  sourceType?: "upload" | "system"
  previewUrl?: string
  bpm?: number | null
  tags?: string[]
  mood?: string
  genre?: string
  licenseName?: string
  licenseUrl?: string | null
  attribution?: string
  waveform?: number[]
}

export interface BgmLibrary {
  tracks: BgmTrack[]
  systemTracks: BgmTrack[]
  recommendations: BgmTrack[]
  favoriteIds: string[]
  categories: string[]
}
