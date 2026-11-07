import type { DatabaseSync } from "node:sqlite"

import {
  completeGenerationTask,
  getGeneratedAsset,
  listGeneratedAssets,
  saveGeneratedAsset,
  type GeneratedAsset,
  type GenerationTargetType,
  type GenerationTask,
} from "./repo.ts"
import {
  getAliyunImageConfig,
  projectImageSeed,
  type AliyunReferenceImage,
} from "./model.ts"
import { withImageStyle } from "./prompt.ts"
import {
  selectGenerationReferenceCandidates,
  withGenerationReferenceInstructions,
  type GenerationReferenceCandidate,
} from "./references.ts"
import { readLook } from "../look.ts"
import { latestSnapshot } from "../assets/repo.ts"
import { readGeneratedImage, writeGeneratedImage } from "./files.ts"
import { runImageGeneration } from "./service.ts"

function loadReferenceImages(
  db: DatabaseSync,
  projectId: string,
  type: GenerationTargetType,
  targetId: string,
): { candidates: GenerationReferenceCandidate[]; images: AliyunReferenceImage[] } {
  const selected = selectGenerationReferenceCandidates({
    targetType: type,
    targetId,
    shots: latestSnapshot(db, projectId, "shots")?.payload ?? [],
    visualCharacters: latestSnapshot(db, projectId, "visualCharacters")?.payload ?? [],
    visualPlaces: latestSnapshot(db, projectId, "visualPlaces")?.payload ?? [],
    assets: listGeneratedAssets(db, projectId),
  })
  const candidates: GenerationReferenceCandidate[] = []
  const images: AliyunReferenceImage[] = []
  for (const candidate of selected) {
    try {
      const bytes = readGeneratedImage(candidate.asset.storageKey)
      if (bytes.length > 10 * 1024 * 1024) continue
      candidates.push(candidate)
      images.push({ bytes, mime: candidate.asset.mime })
    } catch {
      // Missing historical files should not block a new fresh generation.
    }
  }
  return { candidates, images }
}

export async function runQueuedImageTask(
  db: DatabaseSync,
  task: GenerationTask,
): Promise<{ task: GenerationTask; asset: GeneratedAsset }> {
  const request = task.request ?? {}
  const look = readLook(request.look)
  const references = loadReferenceImages(db, task.projectId, task.targetType, task.targetId)
  const effectivePrompt = withGenerationReferenceInstructions(
    withImageStyle(task.prompt, look),
    references.candidates,
  )
  const imageConfig = getAliyunImageConfig()
  const model = references.images.length > 0 ? imageConfig.editModel : imageConfig.model
  const image = await runImageGeneration({
    prompt: effectivePrompt,
    aspect: request.aspect,
    seed: projectImageSeed(task.projectId),
    referenceImages: references.images.length > 0 ? references.images : undefined,
  })
  const file = writeGeneratedImage(task.projectId, task.id, image.bytes, image.mime)
  const asset = saveGeneratedAsset(db, {
    taskId: task.id,
    projectId: task.projectId,
    targetType: task.targetType,
    targetId: task.targetId,
    storageKey: file.storageKey,
    mime: image.mime,
    bytes: file.bytes,
    providerId: "aliyun",
    model,
    prompt: effectivePrompt,
  })
  const completed = completeGenerationTask(db, task.id, asset.id)
  return {
    task: completed,
    asset: getGeneratedAsset(db, asset.id, task.projectId) ?? asset,
  }
}
