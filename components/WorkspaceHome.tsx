'use client'

import { useMemo } from 'react'

import type { TodoItem } from '@/lib/todo'
import type { Act, Character, Episode, StepKey } from '@/lib/types'
import { STEPS } from '@/lib/types'
import type { Scene, Shot, VisualCharacter } from '@/lib/assets/types'
import type { GeneratedAsset } from '@/lib/generation/types'
import { placeGenerationTargetId } from '@/lib/assets/anchors'
import { selectedShotMedia } from '@/lib/production/selected-media'
import type {
  ProductionMode,
  ProductionStageKey,
  ProjectType,
} from '@/lib/production/types'
import type { ProductionPlanDto } from '@/lib/production/client'
import type { ProductionPlanSuggestion } from '@/lib/production/presets'
import type { QuickCreationTarget } from '@/lib/production/quick-trial'
import { buildWorkbenchCommand } from '@/lib/workbench-command'
import { buildProjectProgress } from '@/lib/project-progress'
import {
  buildProjectPulse,
  formatWorkspaceSaved,
  selectCurrentShot,
  workspaceStepLabel,
} from '@/lib/workspace-view'
import ProductionStageHeader from './ProductionStageHeader'
import WorkspaceOnboarding from './WorkspaceOnboarding'
import ProductionActionCenter from './ProductionActionCenter'

/**
 * 项目总览只负责汇总真实状态和提供下一步入口。
 * 修复动作仍回到各步骤的现有写入链路，总览不复制生成或版本逻辑。
 */
interface Props {
  projectId: string
  projectTitle: string
  genreLabel: string
  updatedAt?: number | null
  characters: Character[]
  acts: Act[]
  episodes: Episode[]
  visuals: VisualCharacter[]
  scenes: Scene[]
  shots: Shot[]
  todoItems: TodoItem[]
  currentStep: number
  completed: Record<StepKey, boolean>
  canJump: (step: StepKey) => boolean
  onContinue: (step: StepKey) => void
  onOpenStep: (step: StepKey) => void
  onOpenArtifacts: () => void
  onOpenAgent: () => void
  onTodoAction: (item: TodoItem) => void
  onStartQuickTrial: (idea: string, target: QuickCreationTarget) => Promise<void>
  onStartGuided: (idea: string) => void
  onOpenSource: () => void
  onLoadSample: () => void
  productionPlan: ProductionPlanDto | null
  productionProjectType: ProjectType | null
  productionMode: ProductionMode | null
  productionTargetEpisodes: number
  productionSaving: boolean
  productionPromoting: boolean
  productionError: string | null
  onProductionProjectTypeChange: (value: ProjectType) => void
  onProductionModeChange: (value: ProductionMode) => void
  onProductionTargetEpisodesChange: (value: number) => void
  onCreateProductionPlan: (suggestion?: ProductionPlanSuggestion) => void
  onPromoteProductionPlan: () => void
  onOpenProductionStage: (stage: ProductionStageKey) => void
  selectedImageCount: number
  selectedVideoCount: number
  assets: GeneratedAsset[]
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>
}

export default function WorkspaceHome({
  projectId,
  projectTitle,
  genreLabel,
  updatedAt,
  characters,
  acts,
  episodes,
  visuals,
  scenes,
  shots,
  todoItems,
  currentStep,
  completed,
  onOpenStep,
  onOpenArtifacts,
  onOpenAgent,
  onTodoAction,
  onStartQuickTrial,
  onStartGuided,
  onOpenSource,
  onLoadSample,
  productionPlan,
  productionProjectType,
  productionMode,
  productionTargetEpisodes,
  productionSaving,
  productionPromoting,
  productionError,
  onProductionProjectTypeChange,
  onProductionModeChange,
  onProductionTargetEpisodesChange,
  onCreateProductionPlan,
  onPromoteProductionPlan,
  onOpenProductionStage,
  selectedImageCount,
  selectedVideoCount,
  assets,
}: Props) {
  const step = STEPS.find((item) => item.index === currentStep) ?? STEPS[0]
  const command = buildWorkbenchCommand({
    currentStep,
    completed,
    hasIdea: episodes.length > 0 || characters.length > 0,
    shotDone: shots.filter((shot) => shot.status === "done").length,
    shotTotal: shots.length,
    todoItems,
  })
  const productionStage = productionPlan?.stages.find(
    (stage) => stage.key === productionPlan.currentStage,
  )
  const progress = buildProjectProgress({
    projectId,
    projectTitle,
    counts: {
      characters: characters.length,
      acts: acts.length,
      episodes: episodes.length,
      visuals: visuals.length,
      scenes: scenes.length,
      shots: shots.length,
      images: selectedImageCount,
      videos: selectedVideoCount,
    },
    completed,
    todoItems,
    productionStage: productionPlan && productionStage
      ? {
          key: productionPlan.currentStage,
          label: productionStage.label,
          position: productionStage.position,
          total: productionPlan.stages.length,
          status: productionStage.status,
          planStatus: productionPlan.status,
        }
      : null,
  })
  const blockerItem = progress.blocker ?? command.blocker
  const nextItem = progress.nextAction ?? command.next
  const activeShot = selectCurrentShot(shots)
  const activeScene = activeShot
    ? scenes.find((scene) => scene.location === activeShot.place || scene.summary === activeShot.scene) ?? scenes[0]
    : scenes[0]
  const activeEpisode = episodes.find((episode) => episode.number === activeShot?.episode) ?? episodes[0]
  const selectedMedia = useMemo(
    () => selectedShotMedia(shots, assets),
    [assets, shots],
  )
  const selectedImageAssets = useMemo(
    () => assets
      .filter((asset) =>
        asset.selectedAt !== null
        && (asset.mediaKind === 'image' || asset.mime.startsWith('image/')),
      )
      .sort((left, right) => (right.selectedAt ?? 0) - (left.selectedAt ?? 0)),
    [assets],
  )
  const activeShotMedia = activeShot ? selectedMedia.get(activeShot.id) : undefined
  const activeCharacterAsset = useMemo(() => {
    if (!activeShot) return null
    for (const characterName of activeShot.characters) {
      const visual = visuals.find((item) => item.name === characterName)
      if (!visual) continue
      const targetIds = new Set(
        [visual.id, visual.entityId].filter((value): value is string => Boolean(value)),
      )
      const asset = selectedImageAssets.find((item) =>
        item.targetType === 'character' && targetIds.has(item.targetId),
      )
      if (asset) return asset
    }
    return null
  }, [activeShot, selectedImageAssets, visuals])
  const activePlaceAsset = useMemo(() => {
    const placeName = activeScene?.location || activeShot?.place || ''
    if (!placeName) return null
    const targetId = placeGenerationTargetId(placeName)
    return selectedImageAssets.find((asset) =>
      asset.targetType === 'place' && asset.targetId === targetId,
    ) ?? null
  }, [activeScene?.location, activeShot?.place, selectedImageAssets])
  const activeVideoAsset = activeShotMedia?.video ?? null
  const activeImageAsset =
    activeShotMedia?.image ?? activeCharacterAsset ?? activePlaceAsset ?? null
  const isSampleProject = projectTitle.trim().startsWith('示例 ·')
  const heroImageUrl = activeImageAsset?.downloadUrl
    ?? (isSampleProject ? '/visuals/premium/umbrella-heir.webp' : null)
  const heroMediaKind = activeVideoAsset
    ? 'video'
    : activeShotMedia?.image
      ? 'shot'
      : activeCharacterAsset
        ? 'character'
        : activePlaceAsset
          ? 'place'
          : isSampleProject
            ? 'sample'
            : null
  const recentAssets = useMemo(() => {
    const seenTargets = new Set<string>()
    const result: GeneratedAsset[] = []
    for (const asset of selectedImageAssets) {
      const key = `${asset.targetType}:${asset.targetId}`
      if (seenTargets.has(key)) continue
      seenTargets.add(key)
      result.push(asset)
      if (result.length === 3) break
    }
    return result
  }, [selectedImageAssets])
  const pulse = buildProjectPulse({
    episodes: episodes.length,
    scenes: scenes.length,
    shots: shots.length,
    todoItems,
  })
  const blockerStep = blockerItem?.step ?? step.key
  const nextStep = nextItem?.step ?? step.key
  const title = activeShot?.missingRefFor.length
    ? `先补${activeShot.missingRefFor.join("、")}的定妆参考，再返修第 ${String(activeShot.shot).padStart(2, "0")} 镜`
    : blockerItem?.text ?? `继续处理${step.nav}`
  const subtitle = activeShot
    ? `镜头 ${String(activeShot.shot).padStart(2, "0")} 的双人画面${activeShot.missingRefFor.length ? `缺少${activeShot.missingRefFor.join("、")}参考图` : "还需要确认首尾帧"}，处理后会立即更新当前集的生产台账。`
    : episodes.length
      ? `当前主链停在「${step.nav}」。先完成这一步，再进入下一步生成。`
      : "这个项目还没有开始。载入示例查看完整流程，或从核心人物开始建立故事圣经。"
  const missingAssetCount =
    characters.filter((character) => !visuals.some((visual) => visual.name === character.name)).length
    + shots.filter((shot) => shot.missingRefFor.length > 0).length
  const blockedTaskCount = todoItems.filter((item) => item.kind === "fix").length
  const currentEpisodeNumber = activeShot?.episode || activeEpisode?.number || 1
  const currentSceneText = activeScene?.number
    ? `场次 ${String(activeScene.number).padStart(2, '0')}`
    : activeShot?.place || '当前场景'
  const heroCaption = activeShot?.dialogue?.trim()
    ? `“${activeShot.dialogue.trim()}”`
    : activeShot?.action || activeEpisode?.synopsis || subtitle
  const mediaLabel =
    heroMediaKind === 'video'
      ? '已采用视频'
      : heroMediaKind === 'shot'
        ? '已采用首帧'
        : heroMediaKind === 'character'
          ? '角色定妆参考'
          : heroMediaKind === 'place'
            ? '场景设定参考'
            : heroMediaKind === 'sample'
              ? '示例镜头画面'
            : '尚未采用画面'
  const productionLabel =
    productionMode === 'sample'
      ? '样片验证'
      : productionMode === 'batch'
        ? '小批生产'
        : productionMode === 'season'
          ? '整季生产'
          : '制作方式未设定'
  const hasExistingContent = Boolean(
    characters.length
    || acts.length
    || episodes.length
    || visuals.length
    || scenes.length
    || shots.length,
  )

  if (!hasExistingContent) {
    return (
      <WorkspaceOnboarding
        onStartQuickTrial={onStartQuickTrial}
        onStartGuided={onStartGuided}
        onOpenSource={onOpenSource}
        onLoadSample={onLoadSample}
      />
    )
  }

  return (
    <div className="wfx-home wfx-dossier">
      <header className="wfx-dossier-head">
        <div>
          <span className="wfx-dossier-kicker">
            继续创作 · 第 {step.index} 步 · {step.nav}
          </span>
          <h1>{projectTitle}</h1>
          <p>
            {genreLabel} · {episodes.length} 集 · {shots.length} 镜 · {formatWorkspaceSaved(updatedAt)}
          </p>
        </div>
        <button className="wfx-dossier-agent-link" type="button" onClick={onOpenAgent}>
          <span>Veya</span>
          检查当前卡点
        </button>
      </header>

      <div className="wfx-dossier-grid">
        <main className="wfx-dossier-main">
          <section className="wfx-shot-dossier" aria-labelledby="wfx-shot-dossier-title">
            <div
              className="wfx-shot-dossier-ambient"
              aria-hidden="true"
              style={heroImageUrl ? { backgroundImage: `url("${heroImageUrl}")` } : undefined}
            />
            <div className={`wfx-shot-dossier-media ${activeShot?.params.ratio === '16:9' ? 'is-landscape' : ''}`}>
              {activeVideoAsset ? (
                <video
                  src={activeVideoAsset.downloadUrl}
                  aria-label={`第 ${activeShot?.shot ?? 1} 镜已采用视频`}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : heroImageUrl ? (
                <img
                  src={heroImageUrl}
                  alt={
                    heroMediaKind === 'shot'
                      ? `第 ${activeShot?.shot ?? 1} 镜已采用首帧`
                      : heroMediaKind === 'character'
                        ? '当前镜头角色定妆参考'
                        : heroMediaKind === 'place'
                          ? '当前镜头场景参考'
                          : '示例项目镜头画面'
                  }
                  width={720}
                  height={1280}
                />
              ) : (
                <div className="wfx-shot-dossier-empty">
                  <span aria-hidden="true">
                    <svg viewBox="0 0 32 32">
                      <rect x="4" y="6" width="24" height="20" rx="2" />
                      <path d="m11 11 11 5-11 5z" />
                    </svg>
                  </span>
                  <b>还没有可采用的画面</b>
                  <p>先完成当前镜头的首帧或视频，工作台会直接展示结果。</p>
                </div>
              )}
              <div className="wfx-shot-dossier-media-topline">
                <span>{mediaLabel}</span>
                <i>{activeShot?.params.ratio || '9:16'}</i>
              </div>
              <div className="wfx-shot-dossier-media-bottomline">
                <span>SHOT {String(activeShot?.shot ?? 1).padStart(2, '0')}</span>
                <span>{activeShot?.params.duration ?? 0}s</span>
              </div>
            </div>

            <div className="wfx-shot-dossier-copy">
              <span className="wfx-dossier-kicker">
                当前镜头 · 第 {currentEpisodeNumber} 集 · {currentSceneText}
              </span>
              <p className="wfx-shot-dossier-title" id="wfx-shot-dossier-title">
                {activeShot?.action || activeEpisode?.title || title}
              </p>
              <p className="wfx-shot-dossier-caption">{heroCaption}</p>

              <div className={`wfx-dossier-blocker ${blockerItem ? 'is-warning' : 'is-clear'}`}>
                <div>
                  <span>{blockerItem ? '当前卡点' : '当前状态'}</span>
                  <b>{blockerItem?.text ?? '当前主线没有阻断，可以继续完成这一镜。'}</b>
                </div>
                <button
                  className="wfx-button"
                  type="button"
                  onClick={() => onOpenStep(blockerItem ? blockerStep : step.key)}
                >
                  {blockerItem ? '处理当前阻断' : `继续${step.nav}`}
                  <ArrowIcon />
                </button>
              </div>

              <div className="wfx-dossier-meta" aria-label="镜头属性">
                <span>{activeShot?.shotSize || '待定景别'}</span>
                <span>{activeShot?.camera || '待定运镜'}</span>
                <span>{activeShot?.characters.join('、') || '暂无角色'}</span>
              </div>

              <div className="wfx-dossier-secondary-actions">
                <button type="button" onClick={() => onOpenStep('shots')}>
                  打开分镜工作区
                </button>
                <button type="button" onClick={() => onOpenStep('visuals')}>
                  检查角色定妆
                </button>
              </div>
            </div>
          </section>

          <ProductionActionCenter
            items={todoItems}
            onAction={onTodoAction}
            limit={2}
            excludeId={blockerItem?.id}
            title="后续处理"
          />

          <section className="wfx-recent-dossier" aria-labelledby="wfx-recent-dossier-title">
            <header>
              <div>
                <span className="wfx-dossier-kicker">已采用资产</span>
                <h2 id="wfx-recent-dossier-title">最近画面</h2>
              </div>
              <button type="button" onClick={onOpenArtifacts}>查看版本</button>
            </header>
            {recentAssets.length > 0 ? (
              <div className="wfx-recent-dossier-grid">
                {recentAssets.map((asset) => {
                  const shot = shots.find((item) =>
                    item.id === asset.targetId || item.entityId === asset.targetId,
                  )
                  const character = visuals.find((item) =>
                    item.id === asset.targetId || item.entityId === asset.targetId,
                  )
                  const scene = scenes.find((item) =>
                    placeGenerationTargetId(item.location) === asset.targetId,
                  )
                  const label = asset.targetType === 'shot'
                    ? `第 ${shot?.episode || 1} 集 · 第 ${shot?.shot ?? '—'} 镜`
                    : asset.targetType === 'character'
                      ? character?.name || '角色定妆'
                      : scene?.location || '场景设定'
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => onOpenStep(
                        asset.targetType === 'character'
                          ? 'visuals'
                          : asset.targetType === 'place'
                            ? 'scenes'
                            : 'shots',
                      )}
                    >
                      <img src={asset.downloadUrl} alt={label} loading="lazy" width={640} height={360} />
                      <span>
                        <small>{mediaLabelForAsset(asset)}</small>
                        <b>{label}</b>
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : isSampleProject ? (
              <div className="wfx-recent-dossier-grid is-sample">
                <button type="button" onClick={() => onOpenStep('shots')}>
                  <img src="/visuals/premium/umbrella-heir.webp" alt="示例镜头画面" loading="lazy" width={640} height={360} />
                  <span><small>示例镜头</small><b>雨夜门外对峙</b></span>
                </button>
                <button type="button" onClick={() => onOpenStep('visuals')}>
                  <img src="/visuals/premium/estate-rain.webp" alt="示例角色定妆" loading="lazy" width={640} height={360} />
                  <span><small>示例定妆</small><b>陈默 · 苏婉</b></span>
                </button>
                <button type="button" onClick={() => onOpenStep('scenes')}>
                  <img src="/visuals/premium/green-corridor.webp" alt="示例场景设定" loading="lazy" width={640} height={360} />
                  <span><small>示例场景</small><b>苏婉家旧楼门口</b></span>
                </button>
              </div>
            ) : (
              <div className="wfx-recent-dossier-empty">
                <b>还没有已采用的制作画面</b>
                <p>完成首帧、定妆或场景图后，这里会按真实资产自动出现。</p>
              </div>
            )}
          </section>
        </main>

        <aside className="wfx-dossier-rail" aria-label="项目状态">
          <section>
            <span className="wfx-dossier-kicker">项目脉搏</span>
            <div className="wfx-dossier-pulse">
              <div><b>{pulse.episodes}</b><span>集</span></div>
              <div><b>{pulse.scenes}</b><span>场</span></div>
              <div><b>{pulse.shots}</b><span>镜</span></div>
              <div className={pulse.blockers ? 'is-warning' : ''}><b>{pulse.blockers}</b><span>阻断</span></div>
            </div>
          </section>

          <section>
            <span className="wfx-dossier-kicker">下一步</span>
            <b className="wfx-dossier-next-title">
              {blockerItem?.text ?? nextItem?.text ?? `继续${workspaceStepLabel(nextStep)}`}
            </b>
            <button className="wfx-dossier-inline-link" type="button" onClick={() => onOpenStep(nextStep)}>
              前往{workspaceStepLabel(nextStep)}
              <ArrowIcon />
            </button>
          </section>

          <section>
            <span className="wfx-dossier-kicker">可调用方法</span>
            <div className="wfx-dossier-methods">
              <button type="button" onClick={() => onOpenStep('shots')}>
                <span>镜头连续性检查</span>
                <small>缺图、锚点与返修</small>
              </button>
              <button type="button" onClick={() => onOpenStep('episodes')}>
                <span>故事医生</span>
                <small>钩子、节奏与结构</small>
              </button>
            </div>
          </section>
        </aside>
      </div>

      <details className="wfx-production-dossier">
        <summary>
          <div>
            <span className="wfx-dossier-kicker">制作设置</span>
            <b>{productionLabel} · 目标 {productionTargetEpisodes} 集</b>
          </div>
          <span>{productionPlan ? '已建立生产计划' : '待确认制作方式'}</span>
        </summary>
        <ProductionStageHeader
          plan={productionPlan}
          projectType={productionProjectType}
          mode={productionMode}
          targetEpisodes={productionTargetEpisodes}
          episodeCount={episodes.length}
          missingAssetCount={missingAssetCount}
          blockedTaskCount={blockedTaskCount}
          saving={productionSaving}
          promoting={productionPromoting}
          error={productionError}
          hasExistingContent={hasExistingContent}
          onProjectTypeChange={onProductionProjectTypeChange}
          onModeChange={onProductionModeChange}
          onTargetEpisodesChange={onProductionTargetEpisodesChange}
          onCreatePlan={() => onCreateProductionPlan()}
          onAcceptSuggestion={onCreateProductionPlan}
          onPromote={onPromoteProductionPlan}
          onOpenStage={onOpenProductionStage}
        />
      </details>

      <div className="wfx-home-meta" aria-hidden="true">
        {characters.length} 人物 · {acts.length} 幕 · {visuals.length} 定妆
      </div>
    </div>
  )
}

function mediaLabelForAsset(asset: GeneratedAsset): string {
  if (asset.targetType === 'shot') return '镜头首帧'
  if (asset.targetType === 'character') return '角色定妆'
  return '场景设定'
}
