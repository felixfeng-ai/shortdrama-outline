# VeyaFrame 生产操作系统 V3

> 状态：P0 基础链路已实现，后续按 P1/P2 继续增强。
> 日期：2026-11-06，最后更新：2026-11-07。
> 本文承接并扩展 `specs/canvas-production-map/spec.md`、`specs/canvas-orchestration/spec.md`、`specs/creative-operating-system-v2/spec.md`。

## 1. 目标

把 VeyaFrame 从“六步文本生成工作台”升级为面向个人和小型工作室的短剧连续生产系统：

```text
项目类型
→ 生产阶段
→ 双画布工作区
→ 统一 Veya Agent
```

核心用户价值：

1. 先低成本做 1–3 集样片。
2. 验证方向后扩成小批或整季，已有内容不重做。
3. 做到几十集时，人物、场景、声音、Canon、版本、任务和费用不失控。
4. 既能平台内生成视频和成片，也能导出到即梦、可灵、剪映。
5. 保留“一句话直接生成视频”的轻入口，不强迫所有用户进入长剧流程。

## 2. 产品定位

> 面向个人和小型工作室的 Canon-first 短剧连续生产系统。

竞争位置：

| 产品 | 主要竞争点 | VeyaFrame 不正面争夺 |
|---|---|---|
| LibTV | 无限画布、节点自由度、专业编排 | 不争夺最自由节点市场 |
| 小云雀 | Seedance、Agent、模型与内容生态 | 不争夺最多模型和流量生态 |
| Flova | 自然语言 Agent 体验 | 不把聊天框作为唯一主界面 |
| 成剧 | 连续生产、Canon、版本、资产、交付 | 不放弃 Agent 和自由画布能力 |

## 3. 用户必要性

| 能力 | 个人创作者 | 小型工作室 | 判断 |
|---|---|---|---|
| 1–3 集低成本样片 | 很高 | 很高 | 必须 |
| 从 3 集扩展到 10/60 集且不覆盖已有内容 | 极高 | 极高 | 最必须 |
| 当前阶段、阻断和下一步 | 很高 | 很高 | 必须 |
| 小说 / 剧本导入与改编 | 很高 | 很高 | 必须 |
| 批量分集、分镜、图片、视频 | 高 | 极高 | 必须 |
| 角色、场景、声线和视觉资产锁定 | 高 | 极高 | 必须 |
| 自动模型路由 | 高 | 高 | 重要但应隐藏在后台 |
| 制片 Agent | 中高 | 高 | 有价值，不是单独购买理由 |
| 生产依赖画布 | 低中 | 中高 | 增强项，不是首发刚需 |
| 红果等平台数据回流 | 低 | 中 | 后期能力 |

产品文案优先表达结果：

```text
先做 3 集试试
有感觉后扩成 10 集
确认后完成整季
已有内容不会重做
人物、场景、声音和版本保持一致
```

## 4. 项目类型

引入项目类型，但不能把产品拆成多个互不相干的 App。

```ts
type ProjectType =
  | "quick_video"
  | "drama"
  | "marketing"
```

### 4.1 `quick_video`

- 一句话、一张图或一段素材直接生成。
- 不强制进入六步。
- 可保存为快速作品。
- 结果满意后可转成 `drama` 或 `marketing` 项目。

### 4.2 `drama`

- 默认项目类型。
- 支持小说、剧本、一句话和已有项目继续。
- 使用样片、小批、整季生产阶段。
- 使用六步、Canon、资产链、视频、时间线和小说稿。

### 4.3 `marketing`（后续）

- 品牌、产品、卖点、人群和投放目标成为项目事实。
- 支持多尺寸、多时长和多版本广告。
- 复用 Agent、画布、媒体任务、预算和导出能力。
- 不新增一套独立的媒体基础设施。

## 5. 短剧生产模式

### 5.1 模式定义

```ts
type ProductionMode =
  | "sample"
  | "batch"
  | "season"
```

| 模式 | 集数 | 目标 |
|---|---:|---|
| 样片验证 | 1–3 集 | 验证人物、钩子、视觉、成本 |
| 小批生产 | 6–20 集 | 验证连续生产和追更能力 |
| 整季生产 | 30–120 集 | 完成整季交付 |

默认不自动选择模式。新项目必须由用户选择或由 Agent 提议后确认。

### 5.2 阶段状态

```ts
type ProductionStageStatus =
  | "draft"
  | "planning"
  | "generating"
  | "ready_for_review"
  | "blocked"
  | "approved"
  | "completed"
```

### 5.3 非破坏式扩展

必须支持：

```text
样片 3 集 → 小批 10 集 → 整季 60 集
```

规则：

1. 已有分集、场次、分镜、首帧、视频和声音版本不得被覆盖。
2. 扩容只生成缺失集或缺失资产。
3. 新集继承已批准的人物、Look、地点、声线和 Canon。
4. 上游改动只将受影响内容标记为 `stale`。
5. 用户可以选择“只重算过期内容”。
6. 每种扩容都要记录来源版本、目标版本、费用和时间。

禁止当前“修改总数后整批重新生成”的行为直接用于生产扩容。

## 6. 阶段门禁

### 6.1 样片通过

建议检查：

- 主要人物是否可辨认。
- 首集前 3–5 秒是否有明确冲突。
- 前 3 集是否有连续追看钩子。
- 角色、地点和声音是否一致。
- 生成成本是否在预算内。
- 镜头是否具备可交付性。

### 6.2 小批通过

- 10–20 集的人物关系和 Canon 是否连续。
- 镜头、首帧和视频采用率是否稳定。
- 批量生产成本和时间是否可接受。
- 是否存在大量重复镜头或模板化表达。

### 6.3 整季完成

- 所有集的镜头和视频缺口明确。
- TTS、BGM、SRT 和时间线状态明确。
- 外部交付包和内部成片均可用。
- 导出的 manifest、AI 声明和来源快照完整。

门禁结果必须可解释，不能只用总分或百分比代替具体阻断。

## 7. 项目首页

短剧项目首页第一屏显示：

1. 当前项目类型与生产模式。
2. 当前阶段和集数进度。
3. 已完成、缺失、过期和阻断。
4. 当前最重要的下一步。
5. 预计费用、额度、时间。
6. Agent 对当前任务的一句话解释。

主动作示例：

```text
继续第 4 集分镜
补齐 3 个缺失角色锚点
确认样片并晋级小批
生成第 11–20 集
开始整季成片
```

项目首页不再只以“故事输入框”为主角。

## 8. 双画布

### 8.1 视图切换

同一个短剧项目提供：

```text
生产画布（默认） | 自由画布（高级）
```

切换视图只改变可视化方式，不改变项目正文、快照和资产。

### 8.2 生产画布

默认视图，面向大多数用户。

展示：

- 样片 / 小批 / 整季阶段。
- 人物、分集、场次、分镜、首帧、视频、成片。
- 缺失资产、过期内容、生成中和失败任务。
- 当前阻断和修复动作。
- 修改一个角色、地点或 Canon 后受影响的范围。

生产画布主要由项目事实派生，不另存一份正文数据。

### 8.3 自由画布

保留现有节点编排能力，作为高级模式：

- 自由组合模型、素材和生成节点。
- 保存自定义工作流和模板。
- 适合专业用户、实验和复杂制作。
- 不默认打开。

自由画布结果必须通过用户确认：

```text
应用到项目
保存为候选
转为正式集 / 场 / 镜
```

禁止拖拽节点后静默覆盖正式项目。

### 8.4 数据边界

- 生产画布从项目快照和任务状态派生。
- 自由画布继续使用现有 `canvas_graphs`。
- 两个画布共享人物、集、场、镜和资产的稳定 ID。
- 自由画布只保存关系、备注、判断和用户节点，不复制正文。

## 9. 统一 Veya Agent

### 9.1 Agent 定位

一个 Agent，多种工作角色：

```text
Veya Agent
├─ 快速出片
├─ 小说 / 剧本改编
├─ 短剧制片
├─ Canon / 连续性检查
├─ 自由画布编排
└─ 营销策划（后续）
```

“制片 Agent”是角色，不是能力上限。

### 9.2 意图类型

```ts
type AgentIntent =
  | "quick_video"
  | "drama_from_source"
  | "drama_continue"
  | "production_review"
  | "canvas_orchestration"
  | "marketing_plan"
```

路由示例：

| 用户表达 | 路由 |
|---|---|
| “用这句话生成 15 秒视频” | `quick_video` |
| “把这部小说做成 60 集短剧” | `drama_from_source` |
| “继续第 12 集分镜” | `drama_continue` |
| “检查人物有没有崩” | `production_review` |
| “把角色节点和视频节点接起来” | `canvas_orchestration` |
| “用这张产品图做三条广告” | `marketing_plan` |

### 9.3 执行流程

```text
用户表达意图
→ 识别任务类型
→ 读取项目、Canon、资产和预算
→ 输出计划和成本
→ 用户确认
→ 调用对应 Skill
→ 保存候选或草稿
→ 用户采用 / 转为正式项目
```

短任务可以简化确认；长任务、批量任务和付费任务必须明确预算。

### 9.4 快速出片

快速出片始终保留：

```text
一句话 / 一张图 / 一段参考
→ 生成视频
```

不必经过六步。

生成后用户可以：

- 下载或分享。
- 保存为快速作品。
- 转为短剧项目。
- 转为营销项目。

### 9.5 制片能力

短剧项目中的 Agent 可以：

- 解释当前阶段和阻断。
- 规划批次和预算。
- 检查样片和小批是否达到晋级条件。
- 创建缺失集和缺失镜头。
- 检查 Canon、声线和视觉资产。
- 生成审片清单和交付计划。

所有写入仍遵循 Plan / Act / Rollback 和确认边界。

### 9.6 营销视频（后续）

营销项目的事实包括：

- 品牌和产品。
- 核心卖点。
- 目标人群。
- 投放平台。
- 尺寸、比例、时长。
- CTA 和合规红线。

营销 Agent 复用现有：

- Agent 循环与确认卡。
- 图片和视频生成。
- 分镜和镜头。
- 多版本候选。
- 批次任务、预算和导出。

## 10. 来源入口

短剧项目支持：

- 一句话想法。
- 已有小说或剧本。
- 继续已有项目。

小说 / 剧本导入必须生成：

- 章节索引。
- 人物与关系。
- 地点和道具。
- 不可改事实。
- 改编风险。
- 分集计划。
- 可选的样片集数。

不要把 6 万字小说直接一次性发送给模型。

## 11. Canon、资产锁和版本

### 11.1 资产锁

样片批准后可锁定：

- 角色身份。
- 角色视觉锚点。
- 地点锚点。
- 系统声线。
- Look Book。
- 已接受 Canon 事实。

### 11.2 上游变化

上游变化时：

- 已锁资产不自动重写。
- 受影响集和镜头标记为过期。
- Agent 给出影响范围、修复预算和推荐顺序。
- 用户确认后才生成新版本。

## 12. 模型路由

对普通用户隐藏模型复杂度：

```text
镜头类型 + 画幅 + 时长 + 一致性要求 + 预算
→ 推荐最稳 / 最省 / 最快的模型
→ 用户确认
```

高级用户可以在自由画布中手动替换模型。

至少记录：

- 模型。
- Provider。
- Prompt 版本。
- 成本。
- 耗时。
- 质量状态。
- 来源资产版本。

## 13. 交付

保持两条路径：

```text
平台内：镜头视频 → TTS / BGM / SRT → 时间线成片
平台外：执行单 / 首帧 / Prompt → 即梦 / 可灵 / 剪映
```

项目完整备份默认包含：

- 项目事实。
- Canon。
- 分集、场次、分镜。
- 视频、时间线和成片元数据。
- 小说稿。
- Agent 运行记录和导出声明。

## 14. 数据模型

现数据库迁移最高版本为 24，本方案从迁移 25 开始。

### 14.1 扩展 `projects`

建议增加：

```sql
project_type TEXT NOT NULL DEFAULT 'drama'
```

### 14.2 新增 `project_production_plans`

```text
id
project_id
mode
target_episodes
current_stage_id
status
created_at
updated_at
```

### 14.3 新增 `production_stages`

```text
id
project_id
mode
stage_kind
start_episode
end_episode
status
source_snapshot_ids_json
gate_json
approved_at
created_at
updated_at
```

### 14.4 新增 `production_gate_results`

保存门禁结果、阻塞原因、费用、时间和用户决定。

### 14.5 新增 `production_asset_locks`

保存角色、地点、声线、Look、Canon 的锁定版本和来源快照。

### 14.6 新增 `production_extensions`

记录：

```text
from_episode
to_episode
source_stage_id
generated_episode_ids_json
previous_extensions_json
status
cost
```

### 14.7 画布

- 生产画布不新增正文表，由项目状态派生。
- 自由画布继续使用 `canvas_graphs`。
- 如需要区分画布类型，可增加 `view_kind`，默认仍为 `free`。

### 14.8 Agent

Agent 运行记录继续使用 `agent_action_runs`。

新增意图和计划建议保存在：

```text
agent_intent_runs
agent_skill_plans
```

也可以先复用 `agent_action_runs` 的 `action_kind`，避免过早拆表。

## 15. API 规划

### 15.1 生产计划

```text
GET   /api/projects/[id]/production
POST  /api/projects/[id]/production
PATCH /api/projects/[id]/production
```

### 15.2 阶段

```text
GET  /api/projects/[id]/production/stages
POST /api/projects/[id]/production/stages
POST /api/projects/[id]/production/stages/[stageId]/approve
POST /api/projects/[id]/production/stages/[stageId]/block
```

### 15.3 扩展

```text
POST /api/projects/[id]/production/extend
POST /api/projects/[id]/production/missing-assets
```

### 15.4 画布

```text
GET /api/projects/[id]/production/canvas
GET /api/projects/[id]/canvas-graph
POST /api/projects/[id]/canvas-graph/apply
```

### 15.5 Agent

复用：

```text
POST /api/agent
```

扩展意图路由、计划和工具调用。

## 16. 前端改动

### 16.1 需要修改

| 文件 | 改动 |
|---|---|
| `app/page.tsx` | 接入项目类型、生产模式、阶段首页、双画布切换、Agent 意图状态 |
| `components/WorkspaceHome.tsx` | 改为当前阶段、阻断、下一步和预算主导 |
| `components/WorkspaceModeTabs.tsx` | 增加生产画布 / 自由画布切换语义 |
| `components/WorkspaceSidebar.tsx` | 显示项目类型、生产阶段和当前阻断 |
| `components/WorkspaceTopbar.tsx` | 显示阶段状态、下一次生成和节省额度 |
| `components/ProjectBar.tsx` | 新建项目时支持项目类型和模式 |
| `components/CanvasGraphWorkspace.tsx` | 作为自由画布高级视图保留 |
| `components/ProjectCanvas.tsx` | 与生产画布/自由画布路由衔接 |
| `components/FullscreenCanvas.tsx` | 支持指定画布视图 |
| `components/AgentDock.tsx` | 显示 Agent 当前角色、任务计划和快捷动作 |
| `components/SkillAgentDrawer.tsx` | 接入 Agent 意图和阶段上下文 |
| `lib/app-nav.ts` | 增加 `projectType`、`productionMode`、`canvasView` 查询状态 |
| `lib/assets/api.ts` | 增加 production、stage、promotion、intent API 客户端 |
| `lib/project-status.ts` | 增加阶段、门禁、阻断和缺失资产 |
| `lib/workspace-view.ts` | 增加阶段首页和画布视图标签 |
| `lib/agent/tools.ts` | 增加阶段、扩展、快速视频、画布应用等工具 |
| `lib/agent/system.ts` | 从通用创作助手改为意图路由和阶段规则 |
| `lib/agent/loop.ts` | 按意图控制最大步数和确认策略 |
| `lib/generation/client.ts` | 支持阶段任务和批量缺口生成 |
| `lib/generation/batch-store.ts` | 恢复阶段批次、暂停和继续 |
| `lib/mobile-context.ts` | 同步项目类型、生产阶段和阻断 |
| `lib/mobile-agent.ts` | 支持快速视频 / 短剧 / 营销意图 |
| `app/workspace-shell.css` | 阶段首页、双画布和 Agent 状态样式 |

### 16.2 新增组件

| 文件 | 作用 |
|---|---|
| `components/ProjectTypePicker.tsx` | 选择快速视频 / 短剧 / 营销 |
| `components/ProductionModePicker.tsx` | 选择样片 / 小批 / 整季 |
| `components/ProductionStageHeader.tsx` | 当前模式、阶段、进度和下一步 |
| `components/ProductionCanvas.tsx` | 默认可读的生产依赖画布 |
| `components/CanvasViewSwitch.tsx` | 生产画布 / 自由画布切换 |
| `components/ProductionGatePanel.tsx` | 阶段门禁和晋级条件 |
| `components/PromoteProductionDialog.tsx` | 从样片扩成小批或整季 |
| `components/ProductionExtensionPanel.tsx` | 缺失集、资产和费用确认 |
| `components/SourceIntakePanel.tsx` | 小说、剧本、想法导入 |
| `components/QuickVideoComposer.tsx` | 一句话/图片快速出片 |
| `components/AgentIntentBadge.tsx` | 展示当前 Agent 角色和意图 |
| `components/MarketingProjectSetup.tsx` | 后续营销项目模板 |

### 16.3 前端交互规则

- 生产画布默认打开，自由画布是高级切换。
- 快速视频不强制进入项目生产页。
- Agent 在快速视频和长剧项目中保持同一入口。
- 阶段晋级前必须展示差异、费用和影响范围。
- 自由画布“应用到项目”必须再次确认。

## 17. 后端改动

### 17.1 需要修改

| 文件 | 改动 |
|---|---|
| `lib/assets/db.ts` | 新增迁移 25 和 production/stage/gate/extension 表 |
| `lib/assets/repo.ts` | 扩展项目类型查询和创建参数 |
| `lib/project-status.ts` | 聚合阶段、阻断、缺失资产和生成任务 |
| `lib/production-map.ts` | 作为生产画布的数据构建来源 |
| `lib/canvas-graph.ts` | 保持自由画布图模型，补 view/应用接口 |
| `lib/canvas-graph-repo.ts` | 增加画布视图或来源版本 |
| `lib/generation/repo.ts` | 支持阶段任务、缺失集任务和批次恢复 |
| `lib/generation/service.ts` | 生成任务带 projectType/stage/gate 关联 |
| `lib/generation/batch.ts` | 批次状态支持阶段暂停和继续 |
| `lib/video/render-service.ts` | 整季成片批次与阶段绑定 |
| `lib/video/render-queue.ts` | 与生产阶段任务优先级统一 |
| `lib/quota.ts` | 增加阶段预算预留和实际结算 |
| `lib/agent/tools.ts` | 增加快速视频、生产、门禁、扩展和画布工具 |
| `lib/agent/system.ts` | 增加阶段上下文和意图路由 |
| `lib/agent/loop.ts` | 按任务风险控制模型往返和确认 |
| `lib/mobile-context.ts` | 返回项目类型、阶段和下一步 |
| `lib/mobile-agent.ts` | 支持完整 Agent 意图路由 |

### 17.2 新增后端模块

| 文件 | 作用 |
|---|---|
| `lib/production/types.ts` | 项目类型、模式、阶段、门禁和锁定类型 |
| `lib/production/presets.ts` | 样片 / 小批 / 整季参数和预算 |
| `lib/production/planner.ts` | 阶段目标和缺失集规划 |
| `lib/production/readiness.ts` | 门禁与晋级判断 |
| `lib/production/promotion.ts` | 非破坏式扩展和阶段升级 |
| `lib/production/source-intake.ts` | 小说/剧本来源包与改编准备 |
| `lib/production/repo.ts` | 生产计划、阶段、门禁、锁定和扩展持久化 |
| `lib/production/canvas.ts` | 从真实项目状态派生生产画布 |
| `lib/production/client.ts` | 前端生产 API 客户端 |
| `lib/agent/intent.ts` | 统一意图识别 |
| `lib/agent/production-tools.ts` | 阶段和扩展相关 Agent 工具 |
| `lib/agent/marketing-tools.ts` | 后续营销项目工具 |

### 17.3 新增 API

| 路由 | 作用 |
|---|---|
| `app/api/projects/[id]/production/route.ts` | 读取/创建/更新生产计划 |
| `app/api/projects/[id]/production/stages/route.ts` | 阶段列表 |
| `app/api/projects/[id]/production/stages/[stageId]/approve/route.ts` | 阶段确认 |
| `app/api/projects/[id]/production/stages/[stageId]/block/route.ts` | 阶段阻断 |
| `app/api/projects/[id]/production/extend/route.ts` | 非破坏式扩容 |
| `app/api/projects/[id]/production/missing-assets/route.ts` | 缺失资产规划 |
| `app/api/projects/[id]/production/canvas/route.ts` | 生产画布数据 |
| `app/api/projects/[id]/canvas-graph/apply/route.ts` | 自由画布应用到项目 |
| `app/api/projects/[id]/source-intake/route.ts` | 小说/剧本转来源包 |
| `app/api/projects/[id]/quick-video/route.ts` | 快速出片 |
| `app/api/agent/intent/route.ts` | 意图识别与计划 |

## 18. 后端规则

1. 所有项目读写继续先做 owner 校验。
2. 所有生成接口继续使用统一限流和额度预留。
3. 阶段晋级和扩容必须幂等。
4. 生产画布不能直接写正文，只能发动作。
5. 自由画布应用到项目必须生成新版本，不覆盖旧版本。
6. 快速视频、短剧和营销项目共用生成任务、资产和费用账本。
7. 任务优先级：

```text
图片 / 视频 / 音频 / 成片：高
小说 / 辅助文本：低
```

## 19. 分阶段实施

### P0 · 首发基础

1. 项目类型。
2. 样片 1–3 集、小批 6–20 集、整季 30–120 集。
3. 阶段状态和项目首页。
4. 非破坏式扩容。
5. 生产画布默认打开。
6. 自由画布切换和读取。
7. 统一 Agent 意图路由。
8. 快速视频保持可独立使用。
9. 小说/剧本导入。
10. 图像、视频、音频和成片阶段任务恢复。

### P1 · 生产增强

1. 阶段门禁和审批。
2. 资产锁和上游变化影响分析。
3. 自由画布“应用到项目”。
4. 自动模型路由。
5. 阶段成本和质量对比。
6. 项目级 Agent 任务计划。

### P2 · 业务扩展

1. AI 营销视频项目类型。
2. 营销 Agent 和广告变体模板。
3. 红果等平台数据手动导入。
4. 后续再评估自动数据回流和投流接口。

## 20. 测试计划

### 20.1 单元测试

- 模式和集数预设。
- 阶段状态机。
- 门禁结果。
- 非破坏式扩容。
- 资产锁继承。
- 上游变化标记过期。
- Agent 意图识别。
- 快速视频转项目。
- 双画布数据映射。

建议文件：

```text
tests/production-mode.test.ts
tests/production-stage.test.ts
tests/production-promotion.test.ts
tests/production-locks.test.ts
tests/agent-intent.test.ts
tests/quick-video.test.ts
tests/production-canvas.test.ts
tests/canvas-view-switch.test.ts
```

### 20.2 API 集成测试

- 项目类型隔离。
- 阶段创建和确认。
- 扩容幂等。
- 已有集不被覆盖。
- 自由画布应用生成新版本。
- Agent 长任务的预算和确认。
- owner 隔离。

### 20.3 UI 验收

- 1440 / 768 / 390。
- 快速出片不进入长剧流程。
- 样片晋级小批可确认费用。
- 生产画布默认可读。
- 自由画布切换不丢状态。
- Agent 在两种画布中保持上下文。
- 长中文、长集数、长 Prompt 不溢出。

## 21. 验收标准

1. 创建 3 集样片后，可扩展到 10 集而不重写已有 3 集。
2. 已有角色、场次、分镜、首帧、声线和 Canon 的稳定 ID 不变。
3. 项目首页能明确显示当前模式、阶段、阻断和下一步。
4. 生产画布默认展示真实阶段和依赖。
5. 自由画布仍可进行节点编排。
6. 自由画布结果只有用户确认后才能写入正式项目。
7. Agent 能识别快速视频、长剧、检查、画布和营销意图。
8. “一句话生成视频”不强制创建六步项目。
9. 所有长任务显示预计费用和额度。
10. 现有图片、视频、TTS、时间线、导出和小说能力不回归。

## 22. 非目标

- 不追求接入最多模型。
- 不做通用社交内容和流量分发平台。
- 不在首发阶段接入红果自动投流。
- 不把自由画布做成与项目事实脱节的独立产品。
- 不把 Agent 限死为只能做长剧。
- 不自动覆盖用户已确认的资产或正文。
