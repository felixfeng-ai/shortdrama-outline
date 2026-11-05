import type { DatabaseSync } from "node:sqlite"
import { createHash } from "node:crypto"

import { InputError } from "../api.ts"
import { writeGeneratedAudio } from "../generation/files.ts"
import {
  completeGenerationTask,
  createGenerationTask,
  failGenerationTask,
  listGeneratedAssets,
  markGenerationTaskRunning,
  saveGeneratedAsset,
} from "../generation/repo.ts"
import type { GeneratedAsset, GenerationTask } from "../generation/types.ts"
import { listVoiceCharacters, listVoiceProfiles } from "./repo.ts"
import {
  countSpeechCharacters,
  estimateSpeechCostMicros,
  getMiniMaxSpeechConfig,
} from "./tts-model.ts"
import { synthesizeMiniMaxSpeech } from "./tts-service.ts"
import { findProjectShot } from "../video/tasks.ts"

export function prepareShotTts(
  db: DatabaseSync,
  projectId: string,
  shotId: string,
) {
  const shot = findProjectShot(db, projectId, shotId)
  if (!shot) throw new InputError("当前镜头还没有保存到项目")
  const dialogue = typeof shot.dialogue === "string" ? shot.dialogue.trim() : ""
  const speaker = typeof shot.speaker === "string" ? shot.speaker.trim() : ""
  if (!dialogue) throw new InputError("当前镜头没有台词，不能生成对白")
  if (!speaker) throw new InputError("当前镜头没有标注说话人")

  const character = listVoiceCharacters(db, projectId)
    .find((item) => item.name === speaker)
  if (!character) throw new InputError(`说话人「${speaker}」不在核心人物中`)
  const profile = listVoiceProfiles(db, projectId)
    .find((item) => item.characterEntityId === character.id)
  if (!profile) {
    throw new InputError(`请先为角色「${speaker}」绑定系统音色`)
  }
  const config = getMiniMaxSpeechConfig()
  const characters = countSpeechCharacters(dialogue)
  const estimatedCostMicros = estimateSpeechCostMicros({
    characters,
    pricePer1kCharsMicros: config.pricePer1kCharsMicros,
  })
  return {
    shot,
    dialogue,
    speaker,
    character,
    profile,
    config,
    characters,
    estimatedCostMicros,
  }
}

export async function createAndSynthesizeShotTts(
  db: DatabaseSync,
  input: {
    projectId: string
    shotId: string
    maxBudgetMicros: number
    batchId?: string | null
    idempotencyKey?: string | null
    signal?: AbortSignal
  },
): Promise<{ task: GenerationTask; asset: GeneratedAsset | null; reused: boolean }> {
  const {
    dialogue,
    speaker,
    character,
    profile,
    config,
    characters,
    estimatedCostMicros,
  } = prepareShotTts(db, input.projectId, input.shotId)
  if (input.maxBudgetMicros < estimatedCostMicros) {
    throw new InputError(
      `预计费用 ${(estimatedCostMicros / 1_000_000).toFixed(2)} 元，超过本次预算`,
    )
  }

  // 幂等键包含台词和音色绑定版本；改台词或改音色会生成新的付费任务。
  const contentHash = createHash("sha256")
    .update(JSON.stringify({
      shotId: input.shotId,
      dialogue,
      voiceId: profile.voiceId,
      speed: profile.speed,
      volume: profile.volume,
      profileUpdatedAt: profile.updatedAt,
    }))
    .digest("hex")
    .slice(0, 24)
  const idempotencyKey = input.idempotencyKey?.trim()
    ? `tts:${input.idempotencyKey.trim().slice(0, 160)}`
    : `tts:${input.shotId}:${contentHash}`
  const task = createGenerationTask(db, {
    projectId: input.projectId,
    targetType: "shot",
    targetId: input.shotId,
    providerId: "minimax",
    model: config.model,
    prompt: dialogue,
    mediaKind: "audio",
    batchId: input.batchId ?? null,
    request: {
      mode: "dialogue-tts",
      speaker,
      characterId: character.id,
      voiceProfileId: profile.id,
      voiceId: profile.voiceId,
      speed: profile.speed,
      volume: profile.volume,
      characters,
      pricePer1kCharsMicros: config.pricePer1kCharsMicros,
    },
    pricingVersion: `minimax-tts-${config.pricePer1kCharsMicros}`,
    estimatedCostMicros,
    maxAttempts: 1,
    idempotencyKey,
    nextPollAt: Date.now(),
  })
  if (task.status !== "queued" || task.providerTaskId) {
    const asset = listGeneratedAssets(
      db,
      input.projectId,
      "shot",
      input.shotId,
      "audio",
    ).find((item) => item.taskId === task.id) ?? null
    return { task, asset, reused: true }
  }

  markGenerationTaskRunning(db, task.id)
  try {
    const speech = await synthesizeMiniMaxSpeech({
      text: dialogue,
      voiceId: profile.voiceId,
      speed: profile.speed,
      volume: profile.volume,
      signal: input.signal,
    })
    const file = writeGeneratedAudio(
      input.projectId,
      `${task.id}-speech`,
      speech.bytes,
      speech.mime,
    )
    const asset = saveGeneratedAsset(db, {
      taskId: task.id,
      projectId: input.projectId,
      targetType: "shot",
      targetId: input.shotId,
      storageKey: file.storageKey,
      mime: speech.mime,
      bytes: file.bytes,
      providerId: "minimax",
      model: speech.model,
      prompt: dialogue,
      mediaKind: "audio",
      durationMs: speech.durationMs,
      sha256: createHash("sha256").update(speech.bytes).digest("hex"),
      generationMeta: {
        speaker,
        characterId: character.id,
        voiceProfileId: profile.id,
        voiceId: profile.voiceId,
        characters,
        usageCharacters: speech.usageCharacters,
        usage: speech.usage,
        pricePer1kCharsMicros: config.pricePer1kCharsMicros,
      },
    })
    return {
      task: completeGenerationTask(db, task.id, asset.id),
      asset,
      reused: false,
    }
  } catch (error) {
    failGenerationTask(
      db,
      task.id,
      error instanceof Error ? error.message : "语音生成失败",
    )
    throw error
  }
}
