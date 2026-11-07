// 阶段门禁返回逐条阻断，便于首页直接告诉用户下一步该做什么。
import type {
  ProductionBlocker,
  ProductionReadiness,
  ProductionReadinessInput,
} from "./types.ts"

export function evaluateProductionReadiness(
  input: ProductionReadinessInput,
): ProductionReadiness {
  const blockers: ProductionBlocker[] = []
  const missingEpisodes = Math.max(0, input.targetEpisodes - input.episodeCount)
  if (missingEpisodes > 0) {
    blockers.push({
      code: "episodes_incomplete",
      message: `目标 ${input.targetEpisodes} 集，还缺 ${missingEpisodes} 集。`,
      count: missingEpisodes,
    })
  }
  if (input.missingAssetCount > 0) {
    blockers.push({
      code: "missing_assets",
      message: `还有 ${input.missingAssetCount} 个制作资产没有补齐。`,
      count: input.missingAssetCount,
    })
  }
  if (input.blockedTaskCount > 0) {
    blockers.push({
      code: "blocked_tasks",
      message: `${input.blockedTaskCount} 个生成任务失败或需要人处理。`,
      count: input.blockedTaskCount,
    })
  }
  if (input.openGateCount > 0) {
    blockers.push({
      code: "open_gates",
      message: `${input.openGateCount} 项阶段检查尚未确认。`,
      count: input.openGateCount,
    })
  }

  return {
    ready: blockers.length === 0,
    blockers,
    summary: blockers.length === 0
      ? `${input.mode === "sample" ? "样片" : input.mode === "batch" ? "小批" : "整季"}已经通过当前门禁，可以晋级。`
      : `当前有 ${blockers.length} 类阻断，需要逐项处理后再晋级。`,
  }
}
