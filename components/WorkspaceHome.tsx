'use client'

import type { TodoItem } from '@/lib/todo'
import type { Act, Character, Episode, StepKey } from '@/lib/types'
import { STEPS } from '@/lib/types'
import type { Scene, Shot, VisualCharacter } from '@/lib/assets/types'
import type {
  ProductionMode,
  ProductionStageKey,
  ProjectType,
} from '@/lib/production/types'
import type { ProductionPlanDto } from '@/lib/production/client'
import type { ProductionPlanSuggestion } from '@/lib/production/presets'
import { buildWorkbenchCommand } from '@/lib/workbench-command'
import {
  buildProjectPulse,
  formatWorkspaceSaved,
  selectCurrentShot,
  workspaceStepLabel,
} from '@/lib/workspace-view'
import ProductionStageHeader from './ProductionStageHeader'
import WorkspaceOnboarding from './WorkspaceOnboarding'

interface Props {
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
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12M11 5l5 5-5 5" /></svg>
}

export default function WorkspaceHome({
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
  canJump,
  onContinue,
  onOpenStep,
  onOpenArtifacts,
  onOpenAgent,
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
  const activeShot = selectCurrentShot(shots)
  const activeScene = activeShot
    ? scenes.find((scene) => scene.location === activeShot.place || scene.summary === activeShot.scene) ?? scenes[0]
    : scenes[0]
  const activeEpisode = episodes.find((episode) => episode.number === activeShot?.episode) ?? episodes[0]
  const pulse = buildProjectPulse({
    episodes: episodes.length,
    scenes: scenes.length,
    shots: shots.length,
    todoItems,
  })
  const blockerStep = command.blocker?.step ?? step.key
  const nextStep = command.next?.step ?? step.key
  const imageSrc = activeShot ? "/skills/manor.png" : activeEpisode ? "/skills/story.png" : null
  const title = activeShot?.missingRefFor.length
    ? `先补${activeShot.missingRefFor.join("、")}的定妆参考，再返修第 ${String(activeShot.shot).padStart(2, "0")} 镜`
    : command.blocker?.text ?? `继续处理${step.nav}`
  const subtitle = activeShot
    ? `镜头 ${String(activeShot.shot).padStart(2, "0")} 的双人画面${activeShot.missingRefFor.length ? `缺少${activeShot.missingRefFor.join("、")}参考图` : "还需要确认首尾帧"}，处理后会立即更新当前集的生产台账。`
    : episodes.length
      ? `当前主链停在「${step.nav}」。先完成这一步，再进入下一步生成。`
      : "这个项目还没有开始。载入示例查看完整流程，或从核心人物开始建立故事圣经。"
  const recentShots = [...shots].sort((a, b) => a.shot - b.shot).slice(0, 3)
  const missingAssetCount =
    characters.filter((character) => !visuals.some((visual) => visual.name === character.name)).length
    + shots.filter((shot) => shot.missingRefFor.length > 0).length
  const blockedTaskCount = todoItems.filter((item) => item.kind === "fix").length
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
        onCreateIdea={() => onOpenStep("characters")}
        onOpenSource={onOpenSource}
        onLoadSample={onLoadSample}
      />
    )
  }

  return (
    <div className="wfx-home">
      <header className="wfx-page-head">
        <div>
          <h1>继续创作</h1>
          <p>
            {projectTitle} · {genreLabel} · {episodes.length} 集 · {formatWorkspaceSaved(updatedAt)}
          </p>
        </div>
        <div className="wfx-page-actions">
          <button className="wfx-button" type="button" onClick={() => onContinue(step.key)}>
            继续{step.nav}<ArrowIcon />
          </button>
        </div>
      </header>

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

      <section className="wfx-command" aria-labelledby="wfx-command-title">
        <div className="wfx-command-copy">
          <h2 id="wfx-command-title">{title}</h2>
          <div className="wfx-command-state">
            <span className={`wfx-status-pill ${command.blocker ? "is-warning" : "is-accent"}`}>
              <i />{command.blocker ? `${pulse.blockers} 个阻断` : "主线正常"}
            </span>
            <span>当前任务 · 第 {step.index} 步</span>
          </div>
          <p>{subtitle}</p>
        </div>
        <div className="wfx-command-actions">
          <button className="wfx-button" type="button" onClick={() => onOpenStep(blockerStep)}>
            {command.blocker ? "处理阻断" : "继续当前步骤"}
          </button>
          <button className="wfx-button is-ghost" type="button" onClick={onOpenAgent}>
            让 Veya 检查
          </button>
        </div>
        <div className="wfx-step-track" aria-label="六步创作进度">
          {STEPS.map((item) => {
            const current = item.index === currentStep
            const done = completed[item.key]
            const reachable = done || current || canJump(item.key)
            return (
              <button
                key={item.key}
                className={`${done ? "is-done" : ""} ${current ? "is-current" : ""}`}
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onOpenStep(item.key)}
              >
                <i /><span>{workspaceStepLabel(item.key)}</span>
              </button>
            )
          })}
        </div>
      </section>

      <div className="wfx-home-grid">
        <section className="wfx-panel wfx-current-panel" aria-labelledby="wfx-current-title">
          <header className="wfx-panel-head">
            <div>
              <h2 id="wfx-current-title">当前工作</h2>
              <p>
                {shots.length} 个镜头 · {todoItems.filter((item) => item.kind === "fix").length} 个待处理
                {activeEpisode ? ` · 第 ${activeEpisode.number} 集` : ""}
              </p>
            </div>
            <span className="wfx-status-pill is-accent">分镜审阅</span>
          </header>

          {activeShot || activeEpisode ? (
            <div className="wfx-current-preview">
              <div className="wfx-current-image-wrap">
                {imageSrc && <img src={imageSrc} alt={activeShot ? `镜头 ${activeShot.shot} 的场景参考` : activeEpisode.title} />}
                <span className="wfx-image-badge">
                  <i />{activeShot ? `镜头 ${String(activeShot.shot).padStart(2, "0")} · ${activeShot.params.duration} 秒` : `第 ${activeEpisode?.number ?? 1} 集`}
                </span>
              </div>
              <div className="wfx-current-copy">
                <span className="wfx-meta">
                  {activeShot
                    ? `第 ${activeShot.episode || activeEpisode?.number || 1} 集 · 场次 ${activeScene?.number ?? "03"} · ${activeShot.place || activeScene?.location || "当前场景"}`
                    : activeEpisode?.title}
                </span>
                <h3>{activeShot?.action || activeEpisode?.title || "等待故事内容"}</h3>
                <p>{activeShot?.dialogue || activeShot?.prompt || activeEpisode?.synopsis || "完成上一步后，这里会出现当前镜头与处理建议。"}</p>
                <div className="wfx-current-meta">
                  <span className="wfx-status-pill">{activeShot?.shotSize || "中景"}</span>
                  <span className="wfx-status-pill">{activeShot?.params.ratio || "9:16"}</span>
                  <span className={`wfx-status-pill ${activeShot?.missingRefFor.length ? "is-warning" : ""}`}>
                    {activeShot?.missingRefFor.length ? `缺${activeShot.missingRefFor.join("、")}参考图` : command.blocker ? "待确认" : "已就绪"}
                  </span>
                </div>
                <div className="wfx-issue-row">
                  <div>
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3 18 17H2z" /><path d="M10 8v4M10 15h.01" /></svg>
                    <span>修改角色定妆后，相关镜头会被标记为待复核，不会静默覆盖已有关键帧。</span>
                  </div>
                  <button className="wfx-button is-secondary" type="button" onClick={() => onOpenStep(command.blocker?.step ?? "visuals")}>
                    去补定妆
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="wfx-empty-work">
              <b>还没有可继续的画面</b>
              <p>先载入示例查看完整结构，或从核心人物开始建立第一步。</p>
              <button className="wfx-button" type="button" onClick={onLoadSample}>载入示例项目</button>
            </div>
          )}

          <div className="wfx-shot-list" aria-label="当前集镜头">
            {(recentShots.length ? recentShots : episodes.slice(0, 3).map((episode) => null)).map((shot, index) => {
              if (!shot) return null
              return (
                <button key={shot.id} type="button" onClick={() => onOpenStep("shots")}>
                  <span className="wfx-shot-index">{String(shot.shot).padStart(2, "0")}</span>
                  <span>
                    <b>{shot.action || `镜头 ${shot.shot}`}</b>
                    <small>第 {shot.episode || 1} 集 · {shot.scene || shot.place || "当前场景"} · {shot.shotSize}</small>
                  </span>
                  <em className={`wfx-status-pill ${shot.status === "rework" ? "is-warning" : shot.status === "done" ? "is-accent" : ""}`}>
                    {shot.status === "rework" ? "需返修" : shot.status === "done" ? "已出图" : "待制作"}
                  </em>
                </button>
              )
            })}
            {recentShots.length === 0 && <p className="wfx-shot-empty">当前还没有分镜，完成场次剧本后会在这里出现。</p>}
          </div>
        </section>

        <aside className="wfx-right-rail" aria-label="项目状态">
          <section className="wfx-rail-panel">
            <h3>项目脉搏</h3>
            <div className="wfx-pulse-grid">
              <div><span>分集</span><b>{pulse.episodes}<em>集</em></b></div>
              <div><span>场次</span><b>{pulse.scenes}<em>场</em></b></div>
              <div><span>镜头</span><b>{pulse.shots}<em>镜</em></b></div>
              <div><span>阻断</span><b className={pulse.blockers ? "is-danger" : ""}>{pulse.blockers}<em>项</em></b></div>
            </div>
          </section>

          <section className="wfx-rail-panel">
            <h3>下一步</h3>
            <div className="wfx-next-action">
              <span>{command.blocker ? "最早解除阻塞的动作" : "当前主链的下一步"}</span>
              <b>{command.blocker?.text ?? `继续${workspaceStepLabel(nextStep)}`}</b>
              <button className="wfx-button is-secondary" type="button" onClick={() => onOpenStep(nextStep)}>
                前往{workspaceStepLabel(nextStep)}
              </button>
            </div>
          </section>

          <section className="wfx-rail-panel">
            <h3>可调用的创作方法</h3>
            <div className="wfx-method-list">
              <button type="button" onClick={() => onOpenStep("shots")}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4h12v12H4z" /><path d="m7 10 2 2 4-5" /></svg>
                <span><b>镜头连续性检查</b><small>定位缺图、锚点与返修</small></span>
              </button>
              <button type="button" onClick={() => onOpenStep("episodes")}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14" /><circle cx="10" cy="10" r="6" /></svg>
                <span><b>故事医生</b><small>检查钩子与节奏</small></span>
              </button>
            </div>
          </section>
        </aside>
      </div>

      <section className="wfx-artifacts" aria-labelledby="wfx-artifact-title">
        <header>
          <h2 id="wfx-artifact-title">最近产物</h2>
          <button type="button" onClick={onOpenArtifacts}>查看版本历史</button>
        </header>
        <div className="wfx-artifact-grid">
          <button type="button" onClick={() => onOpenStep("episodes")}>
            <img src="/skills/story.png" alt="分集剧情参考" />
            <span><small>第 3 步 · 最新版本</small><b>{episodes[0]?.title || "分集剧情待生成"}</b><em>{episodes.length} 集 · {episodes[0]?.hook ? "钩子已建立" : "等待内容"}</em></span>
          </button>
          <button type="button" onClick={() => onOpenStep("visuals")}>
            <img src="/skills/canon.png" alt="角色定妆参考" />
            <span><small>第 4 步 · 最新版本</small><b>{visuals.slice(0, 3).map((item) => item.name).join(" · ") || "角色定妆待生成"}</b><em>{visuals.length} 人已建立视觉锚点</em></span>
          </button>
          <button type="button" onClick={() => onOpenStep("shots")}>
            <img src="/skills/manor.png" alt="分镜场景参考" />
            <span><small>第 6 步 · 最新版本</small><b>{shots.length} 个镜头</b><em>{shots.filter((shot) => shot.status === "done").length} 个已出图 · {shots.filter((shot) => shot.status === "rework").length} 个待返修</em></span>
          </button>
        </div>
      </section>

      <div className="wfx-home-meta" aria-hidden="true">
        {characters.length} 人物 · {acts.length} 幕 · {visuals.length} 定妆
      </div>
    </div>
  )
}
