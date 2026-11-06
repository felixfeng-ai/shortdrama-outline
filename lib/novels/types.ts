import type { CreativeBrief } from "../brief.ts"
import type { LookBook } from "../look.ts"
import type { Act, Character, Episode } from "../types.ts"
import type { Scene, VisualCharacter, VisualPlace } from "../assets/types.ts"

/**
 * 小说稿是短剧项目的伴随产物，不是六步剧情链里的第七步。
 * 这里只保留叙事事实与来源版本，制作参数不会进入小说上下文。
 */
export type NovelPresetId = "medium" | "standard" | "serial"

export type NovelEditionStatus =
  | "draft"
  | "planned"
  | "generating"
  | "paused"
  | "complete"
  | "failed"

export type NovelChapterStatus =
  | "planned"
  | "generating"
  | "generated"
  | "edited"
  | "stale"
  | "failed"

export type NovelRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "paused"
  | "complete"
  | "failed"

export interface NovelPreset {
  id: NovelPresetId
  label: string
  description: string
  wordsMin: number
  wordsMax: number
  chaptersMin: number
  chaptersMax: number
  targetChapters: number
  chapterWordsMin: number
  chapterWordsMax: number
}

export interface NovelBudgetEstimate {
  presetId: NovelPresetId
  chapters: number
  wordsMin: number
  wordsMax: number
  outputTokensMin: number
  outputTokensMax: number
  quotaUnits: number
  durationLabel: string
  notice: string
}

export interface NovelSourceShot {
  id: string
  episode: number
  scene: string
  action: string
  speaker: string
  dialogue: string
  characters: string[]
}

export interface NovelSourcePack {
  projectId: string
  title: string
  idea: string
  brief: CreativeBrief
  look: LookBook
  characters: Character[]
  acts: Act[]
  episodes: Episode[]
  scenes: Scene[]
  shots: NovelSourceShot[]
  visualCharacters: VisualCharacter[]
  visualPlaces: VisualPlace[]
  canonFacts: Array<{
    entityName: string
    entityKind: string
    field: string
    value: string
    validFromEpisode: number
    validToEpisode: number
  }>
  materialExcerpts: string[]
  sourceSnapshotIds: string[]
  sourceVersions: Record<string, number>
  signature: string
  capturedAt: number
}

export interface NovelPlannedChapter {
  number: number
  title: string
  outline: string
  hook: string
  targetWords: number
  sourceEpisode: number
  sourceSceneIds: string[]
}

export interface NovelPlannedVolume {
  title: string
  summary: string
  startChapter: number
  endChapter: number
}

export interface NovelPlan {
  volumes: NovelPlannedVolume[]
  chapters: NovelPlannedChapter[]
}

export interface NovelEditionRecord {
  id: string
  projectId: string
  ownerId: string
  title: string
  preset: NovelPresetId
  status: NovelEditionStatus
  targetWordsMin: number
  targetWordsMax: number
  plannedChapters: number
  completedChapters: number
  sourceSnapshotIds: string[]
  sourceSignature: string
  currentRunId: string | null
  createdAt: number
  updatedAt: number
}

export interface NovelVolumeRecord {
  id: string
  novelId: string
  title: string
  summary: string
  startChapter: number
  endChapter: number
  orderIndex: number
}

export interface NovelChapterRecord {
  id: string
  novelId: string
  volumeId: string | null
  number: number
  title: string
  outline: string
  hook: string
  content: string
  summary: string
  targetWords: number
  wordCount: number
  sourceEpisode: number
  sourceSceneIds: string[]
  status: NovelChapterStatus
  revision: number
  sourceSignature: string
  generatedAt: number | null
  updatedAt: number
}

export interface NovelRunRecord {
  id: string
  novelId: string
  projectId: string
  ownerId: string
  status: NovelRunStatus
  cursor: number
  total: number
  completed: number
  budgetUnits: number
  usedUnits: number
  idempotencyKey: string
  error: string | null
  startedAt: number | null
  finishedAt: number | null
  updatedAt: number
}

export interface NovelGenerationResult {
  title: string
  content: string
  summary: string
}

export interface NovelGenerationContext {
  chapter: NovelChapterRecord
  previousChapters: Array<Pick<NovelChapterRecord, "number" | "title" | "summary">>
  sourcePack: NovelSourcePack
}

export type NovelExportFormat = "md" | "txt" | "docx" | "epub" | "zip"

export interface NovelExportChapter {
  number: number
  title: string
  content: string
  wordCount: number
}

export interface NovelExportInput {
  title: string
  presetLabel: string
  status: string
  model: string
  promptVersion: string
  sourceSnapshotIds: string[]
  chapters: NovelExportChapter[]
}

export interface NovelExportArtifact {
  filename: string
  mime: string
  bytes: Uint8Array
}
