"use client"

import { useState } from "react"

import type {
  ProductionMode,
  ProductionStageKey,
  ProjectType,
} from "@/lib/production/types"
import {
  PRODUCTION_MODE_PRESETS,
  buildProductionPlanSuggestion,
  type ProductionPlanSuggestion,
} from "@/lib/production/presets"
import type { ProductionPlanDto } from "@/lib/production/client"
import ProjectTypePicker from "./ProjectTypePicker"
import ProductionModePicker from "./ProductionModePicker"

interface Props {
  plan: ProductionPlanDto | null
  projectType: ProjectType | null
  mode: ProductionMode | null
  targetEpisodes: number
  episodeCount: number
  missingAssetCount: number
  blockedTaskCount: number
  saving: boolean
  promoting: boolean
  error: string | null
  hasExistingContent: boolean
  onProjectTypeChange: (value: ProjectType) => void
  onModeChange: (value: ProductionMode) => void
  onTargetEpisodesChange: (value: number) => void
  onCreatePlan: () => void
  onAcceptSuggestion: (suggestion: ProductionPlanSuggestion) => void
  onPromote: () => void
  onOpenStage: (stage: ProductionStageKey) => void
}

function modeLabel(mode: ProductionMode): string {
  return PRODUCTION_MODE_PRESETS[mode].label
}

export default function ProductionStageHeader({
  plan,
  projectType,
  mode,
  targetEpisodes,
  episodeCount,
  missingAssetCount,
  blockedTaskCount,
  saving,
  promoting,
  error,
  hasExistingContent,
  onProjectTypeChange,
  onModeChange,
  onTargetEpisodesChange,
  onCreatePlan,
  onAcceptSuggestion,
  onPromote,
  onOpenStage,
}: Props) {
  const [showFullSetup, setShowFullSetup] = useState(false)

  if (!plan && hasExistingContent && !showFullSetup) {
    const suggestion = buildProductionPlanSuggestion(episodeCount)
    return (
      <section className="production-migration" aria-labelledby="production-migration-title">
        <div className="production-migration-copy">
          <span>已有内容 · 待确认生产方式</span>
          <h2 id="production-migration-title">
            已识别为 {suggestion.targetEpisodes} 集{suggestion.label}
          </h2>
          <p>
            沿用当前 {episodeCount} 集内容登记生产计划，不会重新生成，也不会覆盖已有分集、场次和镜头。
          </p>
        </div>
        <div className="production-migration-facts" aria-label="迁移建议">
          <span><b>{episodeCount}</b> 集已有内容</span>
          <span><b>{suggestion.label}</b> 建议模式</span>
          <span><b>0</b> 内容重写</span>
        </div>
        <div className="production-migration-actions">
          <button
            className="wfx-button"
            type="button"
            disabled={saving}
            onClick={() => onAcceptSuggestion(suggestion)}
          >
            {saving ? "正在登记…" : "采用建议"}
          </button>
          <button
            className="wfx-button is-secondary"
            type="button"
            disabled={saving}
            onClick={() => {
              onProjectTypeChange("drama")
              onModeChange(suggestion.mode)
              onTargetEpisodesChange(suggestion.targetEpisodes)
              setShowFullSetup(true)
            }}
          >
            调整设置
          </button>
        </div>
      </section>
    )
  }

  if (!plan) {
    return (
      <section className="production-setup" aria-labelledby="production-setup-title">
        <header>
          <div>
            <span>{hasExistingContent ? "生产设置调整" : "生产设置"}</span>
            <h2 id="production-setup-title">
              {hasExistingContent ? "调整生产方式" : "先定义这次要做到哪一步"}
            </h2>
            <p>模式决定默认集数、阶段门禁和费用。已有内容不会被重写。</p>
          </div>
        </header>

        <ProjectTypePicker
          value={projectType}
          onChange={onProjectTypeChange}
          disabled={saving}
        />
        {projectType === "quick_video" ? (
          <div className="production-quick-note">
            <b>快速出片不进入长剧阶段</b>
            <p>可以直接描述画面和动作，也可以之后再转为短剧项目。</p>
          </div>
        ) : (
          <ProductionModePicker
            mode={mode}
            targetEpisodes={targetEpisodes}
            onModeChange={onModeChange}
            onTargetEpisodesChange={onTargetEpisodesChange}
            disabled={saving || projectType !== "drama"}
          />
        )}

        <footer>
          <p>{error || (projectType && mode ? `将按 ${modeLabel(mode)} 建立生产计划。` : "请选择项目类型和生产模式。")}</p>
          <button
            className="wfx-button"
            type="button"
            disabled={saving || !projectType || (projectType === "drama" && !mode)}
            onClick={onCreatePlan}
          >
            {saving ? "正在建立计划…" : projectType === "quick_video" ? "进入快速出片" : "建立生产计划"}
          </button>
        </footer>
      </section>
    )
  }

  const currentIndex = Math.max(0, plan.stages.findIndex((stage) => stage.key === plan.currentStage))
  const currentStage = plan.stages[currentIndex] ?? plan.stages[0]
  const nextStage = plan.stages[currentIndex + 1] ?? null
  const missingEpisodes = Math.max(0, plan.targetEpisodes - episodeCount)
  const nextMode: ProductionMode | null = plan.mode === "sample"
    ? "batch"
    : plan.mode === "batch"
      ? "season"
      : null
  const canPromote = Boolean(nextMode) && missingEpisodes === 0 && blockedTaskCount === 0

  return (
    <section className="production-stage-header" aria-labelledby="production-stage-title">
      <div className="production-stage-summary">
        <div>
          <span>{modeLabel(plan.mode)} · {plan.projectType === "drama" ? "短剧生产" : plan.projectType === "marketing" ? "营销视频" : "快速出片"}</span>
          <h2 id="production-stage-title">当前阶段 · {currentStage?.label ?? "来源与设定"}</h2>
          <p>{currentStage?.description ?? "确认项目来源和制作目标。"}</p>
        </div>
        <div className="production-stage-numbers">
          <span><b>{episodeCount}</b> / {plan.targetEpisodes} 集</span>
          <span><b>{missingAssetCount}</b> 缺失资产</span>
          <span className={missingEpisodes || blockedTaskCount ? "is-warning" : ""}>
            <b>{missingEpisodes + blockedTaskCount}</b> 当前阻断
          </span>
        </div>
      </div>

      <div className="production-stage-track" aria-label="生产阶段进度">
        {plan.stages.map((stage, index) => {
          const isCurrent = stage.key === currentStage?.key
          const isPast = index < currentIndex
          return (
            <button
              key={stage.key}
              type="button"
              className={`${isCurrent ? "is-current" : ""} ${isPast ? "is-past" : ""}`}
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => onOpenStage(stage.key)}
            >
              <i />
              <span>{stage.label}</span>
            </button>
          )
        })}
      </div>

      <footer className="production-stage-next">
        <div>
          <span>下一阶段</span>
          <b>{nextStage?.label ?? "整季交付检查"}</b>
        </div>
        <p>
          {missingEpisodes > 0
            ? `还缺 ${missingEpisodes} 集，先补齐内容再晋级。`
            : blockedTaskCount > 0
              ? `${blockedTaskCount} 个任务需要处理，已完成的镜头和版本不会重写。`
              : "当前目标已齐全，可以检查门禁并继续下一阶段。"}
        </p>
        <div className="production-stage-actions">
          {nextMode && (
            <button
              className="wfx-button is-secondary"
              type="button"
              disabled={!canPromote || promoting}
              onClick={onPromote}
            >
              {promoting
                ? "晋级中…"
                : `晋级${nextMode === "batch" ? "小批" : "整季"}`}
            </button>
          )}
          <button className="wfx-button" type="button" onClick={() => onOpenStage(currentStage?.key ?? "source")}>
            继续当前阶段
          </button>
        </div>
      </footer>
    </section>
  )
}
