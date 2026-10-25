export const SHOT_BATCH_SIZE = 8

export interface ShotBatch {
  index: number
  sceneStart: number
  sceneEnd: number
}

export function planShotBatches(sceneCount: number, batchSize = SHOT_BATCH_SIZE): ShotBatch[] {
  const count = Math.max(0, Math.floor(Number(sceneCount) || 0))
  const size = Math.max(1, Math.floor(batchSize))
  const batches: ShotBatch[] = []
  for (let sceneStart = 1; sceneStart <= count; sceneStart += size) {
    batches.push({
      index: batches.length + 1,
      sceneStart,
      sceneEnd: Math.min(count, sceneStart + size - 1),
    })
  }
  return batches
}

export function shotTokenBudget(sceneCount: number): number {
  const count = Math.min(SHOT_BATCH_SIZE, Math.max(1, Math.floor(Number(sceneCount) || 1)))
  return Math.min(12_000, 5_000 + count * 250)
}

export function shotBatchLabel(batch: ShotBatch, total: number): string {
  const totalBatches = Math.max(1, planShotBatches(total).length)
  return `第 ${batch.index}/${totalBatches} 批 · 第 ${batch.sceneStart}-${batch.sceneEnd} 场`
}
