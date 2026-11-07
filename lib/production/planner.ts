// 生产计划的纯规划逻辑。这里不读写数据库，方便单测和 Agent 预演。
import {
  PRODUCTION_STAGE_KEYS,
  type ProductionPlanSeed,
  type ProductionStage,
  type ProductionStageKey,
  type ProjectType,
  type ProductionMode,
} from "./types.ts"
import { normalizeProductionTarget } from "./presets.ts"

const STAGE_COPY: Record<ProductionStageKey, { label: string; description: string }> = {
  source: { label: "来源与设定", description: "导入想法、小说或剧本，确认题材与生产目标。" },
  characters: { label: "核心人物", description: "建立人物关系、动机和不可变 Canon。" },
  outline: { label: "三幕与分集", description: "确认故事骨架、分集钩子和季节性节奏。" },
  episodes: { label: "分集剧情", description: "写完全部目标集数并标记缺失与过期。" },
  visuals: { label: "角色定妆", description: "锁定角色视觉、地点锚点和声音基线。" },
  scenes: { label: "场次剧本", description: "把分集拆成可连续生产的场次。" },
  shots: { label: "分镜与视频", description: "完成镜头、首帧、视频候选与返修。" },
  delivery: { label: "成片与交付", description: "完成声音、时间线、成片和外部交付包。" },
}

/** 所有非当前阶段先锁住，避免首页同时给出多个互相冲突的主操作。 */
export function buildProductionStages(currentStage: ProductionStageKey): ProductionStage[] {
  return PRODUCTION_STAGE_KEYS.map((key, index) => ({
    key,
    position: index,
    label: STAGE_COPY[key].label,
    description: STAGE_COPY[key].description,
    status: key === currentStage ? "draft" : "blocked",
  }))
}

export function createProductionPlanSeed(input: {
  projectType: ProjectType
  mode: ProductionMode
  targetEpisodes?: number
  currentStage?: ProductionStageKey
}): ProductionPlanSeed {
  const currentStage = input.currentStage ?? "source"
  return {
    projectType: input.projectType,
    mode: input.mode,
    targetEpisodes: normalizeProductionTarget(input.mode, input.targetEpisodes),
    currentStage,
    status: "draft",
    stages: buildProductionStages(currentStage),
  }
}
