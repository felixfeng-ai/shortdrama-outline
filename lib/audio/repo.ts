import type { DatabaseSync } from "node:sqlite"
import { randomUUID } from "node:crypto"

import { InputError } from "../api.ts"
import { latestSnapshot } from "../assets/repo.ts"
import { findSystemVoice } from "./voices.ts"
import type { ProjectVoiceCharacter, VoiceProfile } from "./types.ts"

interface VoiceProfileRow {
  id: string
  project_id: string
  character_entity_id: string
  provider_id: string
  voice_id: string
  label: string
  speed: number
  volume: number
  created_at: number
  updated_at: number
}

function toVoiceProfile(row: VoiceProfileRow): VoiceProfile {
  return {
    id: row.id,
    projectId: row.project_id,
    characterEntityId: row.character_entity_id,
    providerId: "system",
    voiceId: row.voice_id,
    label: row.label,
    speed: row.speed,
    volume: row.volume,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listVoiceCharacters(
  db: DatabaseSync,
  projectId: string,
): ProjectVoiceCharacter[] {
  // 绑定必须落在核心人物的稳定 id 上；显示名后续可改，但音色不能因此丢失。
  const snapshot = latestSnapshot(db, projectId, "characters")
  if (!snapshot || !Array.isArray(snapshot.payload)) return []
  const seen = new Set<string>()
  const characters: ProjectVoiceCharacter[] = []
  for (const item of snapshot.payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const record = item as Record<string, unknown>
    const id = typeof record.id === "string" ? record.id.trim() : ""
    const name = typeof record.name === "string" ? record.name.trim() : ""
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    characters.push({ id, name })
  }
  return characters
}

export function listVoiceProfiles(
  db: DatabaseSync,
  projectId: string,
): VoiceProfile[] {
  const rows = db.prepare(
    "SELECT * FROM voice_profiles WHERE project_id = ? ORDER BY updated_at DESC",
  ).all(projectId) as VoiceProfileRow[]
  return rows.map(toVoiceProfile)
}

export function upsertVoiceProfile(
  db: DatabaseSync,
  projectId: string,
  characterEntityId: string,
  input: { voiceId: string; speed?: number; volume?: number },
): VoiceProfile {
  // provider、label 和音色能力都由服务端目录决定，客户端只能提交 voiceId 与参数。
  const character = listVoiceCharacters(db, projectId)
    .find((item) => item.id === characterEntityId)
  if (!character) throw new InputError("角色不存在或不属于当前项目")
  const voice = findSystemVoice(input.voiceId.trim())
  if (!voice) throw new InputError("系统音色不存在")
  const speed = input.speed ?? 1
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) {
    throw new InputError("语速必须在 0.5-2.0 之间")
  }
  const volume = input.volume ?? 1
  if (!Number.isFinite(volume) || volume < 0 || volume > 2) {
    throw new InputError("音量必须在 0-2.0 之间")
  }

  const now = Date.now()
  // 改绑复用同一条当前记录，保证项目内一个角色只有一个有效音色。
  db.prepare(
    `INSERT INTO voice_profiles
      (id, project_id, character_entity_id, provider_id, voice_id, label,
       speed, volume, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(project_id, character_entity_id) DO UPDATE SET
       provider_id = excluded.provider_id,
       voice_id = excluded.voice_id,
       label = excluded.label,
       speed = excluded.speed,
       volume = excluded.volume,
       updated_at = excluded.updated_at`,
  ).run(
    randomUUID(),
    projectId,
    characterEntityId,
    voice.providerId,
    voice.id,
    voice.label,
    speed,
    volume,
    now,
    now,
  )
  const row = db.prepare(
    "SELECT * FROM voice_profiles WHERE project_id = ? AND character_entity_id = ?",
  ).get(projectId, characterEntityId) as VoiceProfileRow
  return toVoiceProfile(row)
}

export function deleteVoiceProfile(
  db: DatabaseSync,
  projectId: string,
  characterEntityId: string,
): boolean {
  const result = db.prepare(
    "DELETE FROM voice_profiles WHERE project_id = ? AND character_entity_id = ?",
  ).run(projectId, characterEntityId)
  return Number(result.changes) > 0
}
