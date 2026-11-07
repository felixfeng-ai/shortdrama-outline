// 场记的工具层（见 AGENT.md §4）。
//
// 两条纪律写在这里，而不是靠调用方自觉：
//   1. 只读工具只读——它拿到的是一份**状态快照**，改不到真东西；
//   2. 能"写"的只有 propose_*，它们只返回一张待确认卡片（AgentCard），
//      落库由用户点确认后走既有链路完成。这是版本与血缘不被打散的保障。
import type { StepKey } from '../types'
import type { CreativeBrief } from '../brief'
import type { JudgmentEntry } from '../judgment-log'
import { isFlatPacing, pacingHint, pacingSeries } from '../pacing'
import { reviewEpisodes, reviewShots } from '../project-status'
import { auditCreativeQuality } from '../creative-audit'
import { buildTodoList } from '../todo'
import { countSpeechCharacters } from '../audio/text.ts'
import { SYSTEM_VOICES } from '../audio/voices.ts'
import type { GeneratedAsset } from '../generation/types.ts'
import type { MobileVideoTarget } from '../mobile-video.ts'
import { auditVideoCandidates, type VideoQualityIssue } from '../video/quality.ts'
import {
  listSourceMaterials,
  readSourceChunk,
  type SourceMaterialInput,
} from '../skills/source-index'
import { estimateVideoCostMicros } from '../video/model.ts'
import { DEFAULT_EPISODE_COUNT, projectQuotaUnits } from '../episodes.ts'

export interface AgentShot {
  /** 跨版本稳定目标；修改镜头必须用它，不能依赖可变的展示镜号。 */
  targetId: string
  episode: number
  shot: number
  scene: string
  characters: string[]
  missingRefFor: string[]
  status: string
  shotSize: string
  camera: string
  prompt: string
  action: string
  speaker: string
  dialogue: string
}

export interface AgentDecision {
  id: string
  step: StepKey
  question: string
  chosenValue: string
  reason: string
  status: string
  locked: boolean
}

export interface AgentCanonIssue {
  code: string
  severity: 'error' | 'warning'
  entityName: string
  field: string
  message: string
}

export interface AgentSkillContext {
  id: string
  name: string
  version: number
  summary: string
  stageRules: Record<string, string>
  acceptance: string[]
}

export interface AgentEntity {
  type: 'character' | 'place' | 'episode' | 'shot'
  id: string
  name: string
  /** 提案生成时用于漂移检测的当前字段原文。 */
  fields?: Partial<Record<AgentEditableField, string>>
}

export type AgentEditableField = 'personality' | 'space' | 'synopsis' | 'action'

export interface AgentEntityComment {
  id: string
  targetType: AgentEntity['type']
  targetId: string
  targetName: string
  body: string
  status: 'open' | 'resolved'
}

export interface AgentLocalizationBranch {
  id: string
  name: string
  market: string
  locale: string
  status: string
}

export interface AgentLocalizationContext {
  branchId: string
  market: string
  locale: string
  platforms: string[]
  audience: string
  strategy: string
}

export interface AgentLocalizationAudit {
  blocking: number
  warning: number
  issues: string[]
}

export interface AgentLocalizationEntity {
  type: 'episode' | 'shot'
  id: string
  name: string
}

export interface AgentState {
  projectTitle: string
  hasIdea: boolean
  brief: CreativeBrief
  judgments: JudgmentEntry[]
  decisions: AgentDecision[]
  canonIssues: AgentCanonIssue[]
  skill?: AgentSkillContext | null
  entities?: AgentEntity[]
  entityComments?: AgentEntityComment[]
  localizationBranches?: AgentLocalizationBranch[]
  localizationContext?: AgentLocalizationContext | null
  localizationAudit?: AgentLocalizationAudit | null
  localizationEntities?: AgentLocalizationEntity[]
  characters?: { name: string; motivation: string; arc: string }[]
  episodes: {
    number: number
    title: string
    synopsis?: string
    hook: string
    intensity?: number
  }[]
  completed: Record<StepKey, boolean>
  shots: AgentShot[]
  expiredShots: number
  /** 只读视频生产快照；用于回答缺口，不代表已创建任何付费任务。 */
  videoReadiness?: {
    totalShots: number
    frameReady: number
    videoReady: number
    missingFrame: number
    missingVideo: number
    activeTasks: number
    failedTasks: number
  }
  /** 当前项目视频候选与任务快照；只读，不包含 storageKey。 */
  videoAssets?: GeneratedAsset[]
  videoTargets?: MobileVideoTarget[]
  /** 当前项目已绑定音色；只用于建议和 TTS 预算，不含声音样本。 */
  voiceProfiles?: Array<{
    characterName: string
    characterEntityId: string
    voiceId: string
    label: string
  }>
  ttsPricePer1kCharsMicros?: number | null
  /** 每个集的最新固化时间线摘要。 */
  timelineVersions?: Array<{
    episode: number
    versionId: string
    revision: number
    readyCount: number
    blockedCount: number
    issueCount?: number
    totalDurationMs: number
  }>
  quota: {
    remaining: number
    limit: number
    projectsLeft: number
    episodeCount?: number
    projectCost?: number
    unlimited?: boolean
  } | null
  sourceMaterials?: SourceMaterialInput[]
}

export type AgentCard =
  | {
    kind: 'shot-edit'
    targetId: string
    shot: number
    episode: number
    targetLabel: string
    target: 'prompt' | 'action'
    expectedText: string
    text: string
    summary: string
  }
  | {
    kind: 'entity-edit'
    targetType: AgentEntity['type']
    targetId: string
    targetName: string
    field: AgentEditableField
    expectedText: string
    text: string
    summary: string
  }
  | {
    kind: 'localization-edit'
    branchId: string
    targetType: AgentLocalizationEntity['type']
    targetId: string
    targetName: string
    text: string
    summary: string
  }
  | { kind: 'regenerate'; step: StepKey; stepLabel: string; reason: string }
  | {
    kind: 'decision'
    step: StepKey
    stepLabel: string
    question: string
    options: string[]
    recommended: string
    reason: string
  }
  | {
    kind: 'video-plan'
    shotIds: string[]
    shotCount: number
    durationSeconds: number
    model: string
    resolution: string
    estimatedCostMicros: number
    budgetLimitMicros: number
  }
  | {
    kind: 'video-rework'
    episode: number
    shotIds: string[]
    items: Array<{ shotId: string; targetLabel: string; reasons: string[] }>
    reason: string
    summary: string
  }
  | {
    kind: 'timeline-plan'
    episode: number
    operations: Array<Record<string, string | number>>
    summary: string
  }
  | {
    kind: 'voice-plan'
    bindings: Array<{ characterName: string; voiceId: string; label: string }>
    summary: string
  }
  | {
    kind: 'tts-plan'
    episode: number
    shotIds: string[]
    lineCount: number
    characters: number
    estimatedCostMicros: number
    maxBudgetMicros: number
    unboundLines: number
    summary: string
  }
  | {
    kind: 'render-plan'
    episode: number
    versionId: string | null
    revision: number | null
    readyCount: number
    totalShots: number
    blockedCount: number
    issueCount: number
    totalDurationMs: number
    summary: string
  }

export interface ToolResult {
  ok: boolean
  /** 给模型看的压缩短句（不是原始 JSON） */
  content: string
  /** propose 工具产出的待确认卡片；只读工具不产 */
  card?: AgentCard
}

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown>
}

const STEP_LABEL: Record<StepKey, string> = {
  characters: '核心人物',
  acts: '三幕大纲',
  episodes: '分集剧情',
  visuals: '视觉定妆',
  scenes: '场景',
  shots: '分镜',
}

/** 给模型看的工具说明书。schema 是纯数据，前后端都能用（服务端只需它） */
export const AGENT_TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'get_active_skill',
    description: '读取当前项目采用的个人创作方法（Skill）及其版本、阶段规则和验收标准。用户问创作标准、下一步怎么做或为什么这样判断时先调用；Skill 只是方法，不是项目事实。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_localization_branches',
    description: '列出当前项目的海外本地化分支、市场、语言和状态。用户问出海版本或需要选择市场分支时先调用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_localization_context',
    description: '读取指定海外分支的目标市场、平台、受众、改编策略和最新审计摘要。只读，不修改本地化正文。',
    parameters: {
      type: 'object',
      properties: { branchId: { type: 'string' } },
      required: ['branchId'],
    },
  },
  {
    name: 'propose_localization_edit',
    description: '为海外分集或镜头生成待确认的本地化修改卡。只提议，不直接写入；分支和实体必须来自当前项目。',
    parameters: {
      type: 'object',
      properties: {
        branchId: { type: 'string' },
        targetType: { type: 'string', enum: ['episode', 'shot'] },
        targetId: { type: 'string' },
        newText: { type: 'string' },
        summary: { type: 'string' },
      },
      required: ['branchId', 'targetType', 'targetId', 'newText', 'summary'],
    },
  },
  {
    name: 'get_entity_comments',
    description: '读取当前项目中角色、地点、分集或镜头的批注。用户要求根据批注修改时先调用；只返回评论和实体身份，不读取或修改正文快照。',
    parameters: {
      type: 'object',
      properties: {
        targetType: {
          type: 'string',
          enum: ['character', 'place', 'episode', 'shot'],
          description: '可选：只看某类实体',
        },
        targetId: { type: 'string', description: '可选：只看某个实体，必须与 targetType 同时提供' },
      },
      required: [],
    },
  },
  {
    name: 'propose_entity_edit',
    description: '针对角色、地点、分集或镜头生成一条待确认修改卡。只提议，不直接写入；targetId 必须来自当前项目实体。',
    parameters: {
      type: 'object',
      properties: {
        targetType: { type: 'string', enum: ['character', 'place', 'episode', 'shot'] },
        targetId: { type: 'string', description: '当前项目的稳定实体 id' },
        field: {
          type: 'string',
          enum: ['personality', 'space', 'synopsis', 'action'],
          description: '可选：角色性格、地点空间、分集梗概或镜头动作；省略时按实体类型选择默认字段',
        },
        newText: { type: 'string', description: '建议替换或补充的完整文本' },
        summary: { type: 'string', description: '一句话说明要改什么' },
      },
      required: ['targetType', 'targetId', 'newText', 'summary'],
    },
  },
  {
    name: 'list_source_materials',
    description: '列出当前项目保存的小说、剧本和资料原文，以及章节/片段索引。用户要求改编、拆章、提取人物或基于原文创作时先调用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'read_source_chunk',
    description: '按原文 id 和章节索引读取一段真实原文。每次最多约 6000 字；读取前先用 list_source_materials 获取目录，不要声称未读取的章节已经理解。',
    parameters: {
      type: 'object',
      properties: {
        materialId: { type: 'string', description: '原文 id，必须来自 list_source_materials' },
        chunk: { type: 'number', description: '从 0 开始的章节/片段索引' },
      },
      required: ['materialId', 'chunk'],
    },
  },
  {
    name: 'get_project_status',
    description: '查当前项目的六步进度（哪一步做了、哪一步没做）。用户问「还有哪些要处理」「做到哪了」时先调它。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_edit_targets',
    description: '列出当前项目可修改实体的稳定 targetId 与可读名称。修改角色、地点、分集或镜头前必须先调用，不能拿展示序号或名称猜目标。',
    parameters: {
      type: 'object',
      properties: {
        targetType: {
          type: 'string',
          enum: ['character', 'place', 'episode', 'shot'],
          description: '可选：只看某一类实体',
        },
      },
      required: [],
    },
  },
  {
    name: 'audit_shots',
    description: '查分镜的健康状况：共几镜、几镜缺参考图（含镜号与角色名）、几镜提示词掉了角色锚点、几镜标了返修。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'review_episodes',
    description: '只读审片：检查分集钩子、节奏、模板化表达、人物动机和创作契约红线。回答「这一版好不好」时用，不要直接改内容。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_quota',
    description: '查今日剩余创作额度，以及还能跑几个完整项目。用户问「还能用几次」时调用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_decisions',
    description: '读取项目最近的结构化决策，尤其是已接受和已锁定的创作方向。回答取舍、避免重复否决方向或提出新方案前先调用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'audit_canon',
    description: '检查当前项目的 Canon 冲突：角色认知、人物关系、地点和道具状态。只读，不自动修复；提出涉及剧情连续性或人物状态的决策前先调用。',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_docs',
    description: '在这款工具自己的说明文档里检索：怎么导出、怎么拿到出图平台生成视频、怎么批量出定妆图、首尾帧怎么衔接、创作额度怎么算、图存在哪。回答操作类问题必须先查它，并引用出处。',
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: '用户的原话或改写后的问题' } },
      required: ['question'],
    },
  },
  {
    name: 'propose_shot_edit',
    description: '提议改写某一镜的提示词或动作。**只生成待确认卡片，不会直接修改**。targetId 必须来自 list_edit_targets；改画面（光线/构图/氛围/景别）用 target=prompt，只改剧情动作用 target=action。',
    parameters: {
      type: 'object',
      properties: {
        targetId: { type: 'string', description: '当前项目镜头的稳定 targetId' },
        target: { type: 'string', enum: ['prompt', 'action'] },
        newText: { type: 'string', description: '改写后的完整文本（prompt 用英文，action 用中文）' },
        summary: { type: 'string', description: '一句话说明改了什么，给用户确认时看' },
      },
      required: ['targetId', 'target', 'newText'],
    },
  },
  {
    name: 'propose_regenerate',
    description: '建议重新生成某一步（比如「三幕大纲太平」「分集钩子太弱」）。**只生成待确认卡片，不会直接触发生成**。',
    parameters: {
      type: 'object',
      properties: {
        step: { type: 'string', enum: ['characters', 'acts', 'episodes', 'visuals', 'scenes', 'shots'] },
        reason: { type: 'string', description: '为什么建议重跑，一句话' },
      },
      required: ['step', 'reason'],
    },
  },
  {
    name: 'propose_decision',
    description: '提出一条待确认的结构化创作决策。只生成卡片，不直接落库。选项必须互斥、具体，并明确推荐项和理由。',
    parameters: {
      type: 'object',
      properties: {
        step: { type: 'string', enum: ['characters', 'acts', 'episodes', 'visuals', 'scenes', 'shots'] },
        question: { type: 'string', description: '需要用户决定的一个明确问题' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '2-6 个互斥候选方案',
        },
        recommended: { type: 'string', description: '必须来自 options 的推荐方案' },
        reason: { type: 'string', description: '推荐理由，不能为空' },
      },
      required: ['step', 'question', 'options', 'recommended', 'reason'],
    },
  },
  {
    name: 'propose_video_plan',
    description: '为已存在的镜头生成待确认的视频预算卡。只计算镜头数、时长、模型、预计费用和预算上限，不创建付费任务，也不自动采用首帧。',
    parameters: {
      type: 'object',
      properties: {
        shotIds: {
          type: 'array',
          items: { type: 'string' },
          description: '当前项目中的稳定镜头 targetId，最多 12 个',
        },
        model: {
          type: 'string',
          enum: ['MiniMax-H3', 'MiniMax-H3-Highspeed', 'MiniMax-H3-Lite', 'MiniMax-H3-Max'],
        },
        resolution: {
          type: 'string',
          enum: ['480P', '768P', '2K'],
        },
        durationSeconds: {
          type: 'number',
          description: '每个镜头的视频时长，单位秒',
        },
        budgetLimitMicros: {
          type: 'number',
          description: '用户愿意为本次计划支付的预算上限，单位微元',
        },
      },
      required: ['shotIds', 'model', 'resolution', 'durationSeconds', 'budgetLimitMicros'],
    },
  },
  {
    name: 'audit_video_quality',
    description: '只读检查镜头视频候选：缺视频、失败任务、时长、画幅和文件元数据。不重新生成、不采用素材。',
    parameters: {
      type: 'object',
      properties: {
        episode: { type: 'number', description: '要检查的集号；不传则检查全部集' },
      },
      required: [],
    },
  },
  {
    name: 'propose_video_rework',
    description: '根据真实视频质检结果生成返修提案卡。**不创建视频任务**，用户确认后仍需去分镜工作台手动重生成。',
    parameters: {
      type: 'object',
      properties: {
        episode: { type: 'number', description: '返修所属集号' },
        shotIds: {
          type: 'array',
          items: { type: 'string' },
          description: '可选：只返修这些真实镜头 targetId；不传则使用该集全部有问题的镜头',
        },
        reason: { type: 'string', description: '为什么需要返修' },
      },
      required: ['episode', 'reason'],
    },
  },
  {
    name: 'propose_timeline_update',
    description: '提出时间线重排、裁剪或静音操作。只生成待确认卡，不保存草稿、不固化版本、不渲染。',
    parameters: {
      type: 'object',
      properties: {
        episode: { type: 'number', description: '时间线集号' },
        operations: {
          type: 'array',
          description: '1-12 个操作：move 需要 position；trim 需要 inMs/outMs；mute/unmute 不需要额外参数',
          items: {
            type: 'object',
            properties: {
              shotId: { type: 'string', description: '真实镜头 targetId' },
              type: { type: 'string', enum: ['move', 'trim', 'mute', 'unmute'] },
              position: { type: 'number' },
              inMs: { type: 'number' },
              outMs: { type: 'number' },
            },
            required: ['shotId', 'type'],
          },
        },
      },
      required: ['episode', 'operations'],
    },
  },
  {
    name: 'propose_voice_bindings',
    description: '为真实角色建议系统音色。只生成待确认卡，不保存绑定、不接受声音样本或声音克隆。',
    parameters: {
      type: 'object',
      properties: {
        bindings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              characterName: { type: 'string' },
              voiceId: { type: 'string' },
            },
            required: ['characterName', 'voiceId'],
          },
        },
      },
      required: ['bindings'],
    },
  },
  {
    name: 'propose_tts_batch',
    description: '按真实台词和系统音色生成 TTS 批量预算卡。只估算字符和费用，不创建付费任务。',
    parameters: {
      type: 'object',
      properties: {
        episode: { type: 'number' },
        maxBudgetMicros: { type: 'number', description: '本次允许的最大预算，单位微元' },
      },
      required: ['episode', 'maxBudgetMicros'],
    },
  },
  {
    name: 'propose_episode_render',
    description: '检查当前集最新固化时间线和视频就绪度，生成成片预检卡。只出提案，不加入渲染队列。',
    parameters: {
      type: 'object',
      properties: {
        episode: { type: 'number' },
      },
      required: ['episode'],
    },
  },
]

// ── 文档片段（search_docs 的语料）──
//
// v1 用人工整理的片段而不是全仓检索：创作者要的是「怎么做」，不是「哪一行写了什么」。
// 每条都带出处，模型回答时必须引用它——没有出处的操作建议对用户等于噪音。
const DOC_SNIPPETS: { source: string; title: string; text: string; keys: string[] }[] = [
  {
    source: 'README.md#打包带走',
    title: '把产物带到出图平台',
    text: '「打包带走」导出的 zip 里含 project.json、prompts.csv（逐镜提示词）、shotlist.txt（逐镜执行清单）、chaining.txt（首尾帧衔接）、storyboard.html（离线分镜表）。逐镜执行：把提示词复制到出图平台，按「参考图」一栏准备图片；需要衔接的两镜，用上一镜成片的末帧当下一镜首帧。',
    // 关键词要挑「有信息量」的：像「怎么」「拿」这种泛词会让任何问题都命中，
    // 检索就退化成"永远返回第一条"
    keys: ['导出', '打包', '平台', '即梦', '可灵', '视频', '生成', '提示词', 'zip', '产物'],
  },
  {
    source: 'AGENT.md#分镜视觉',
    title: '首尾帧衔接怎么做',
    text: '在镜卡上勾「接下一镜首帧」，分镜工具条就会出现「复制衔接清单」：列出尾帧该导出成什么名字、下一镜的提示词是什么。出图平台选首尾帧模式，上传首帧与尾帧两张图，中间过渡由模型补。',
    keys: ['衔接', '首尾帧', '尾帧', '首帧', '视频', '过渡', '连续'],
  },
  {
    source: 'README.md#批量出图',
    title: '批量出定妆图',
    text: '定妆面板的批量出图工具箱：母版里写 〖变量〗，变量值按角色逐行填。出图平台支持模板变量时一次提交出完全部定妆图；不支持时用「复制全部提示词」逐个出。',
    keys: ['批量', '定妆', '母版', '变量', '一次', '出图'],
  },
  {
    source: 'README.md#三条硬指标',
    title: '图存在哪',
    text: '图片全程留在你本机（Chrome/Edge 用目录直连，其他浏览器用本地库），服务端只记「哪张图属于谁」与指纹，不提供上传通道。',
    keys: ['图', '上传', '隐私', '本地', '安全', '存'],
  },
  {
    source: 'README.md#额度',
    title: '创作额度怎么算',
    text: '跑完一条完整流程（六步）花 13 单位；默认每个身份每天 65 单位，约 5 个完整项目。关键词联想与助手提问各算 1 单位。创作额度按北京时间每天恢复。',
    keys: ['额度', '收费', '多少', '限制', '次数', '钱', '成本'],
  },
  {
    source: 'README.md#六步工作流',
    title: '六步怎么走',
    text: '核心人物 → 三幕大纲 → 分集剧情 → 视觉定妆 → 场景 → 分镜提示词。每一步都能单独重跑；改了上游，下游会被标成「需重新生成」，确认后才更新。',
    keys: ['六步', '流程', '步骤', '顺序'],
  },
]

/** 关键词命中打分：命中越多、越靠前越相关。纯函数，方便单测 */
export function searchDocs(question: string): { source: string; title: string; text: string }[] {
  const q = question.toLowerCase()
  return DOC_SNIPPETS
    .map((d) => ({ d, score: d.keys.reduce((n, k) => (q.includes(k.toLowerCase()) ? n + 1 : n), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => ({ source: x.d.source, title: x.d.title, text: x.d.text }))
}

function qualityReportFor(state: AgentState, episode?: number) {
  return auditVideoCandidates({
    targets: state.videoTargets ?? [],
    assets: state.videoAssets ?? [],
    episode,
  })
}

function videoIssueSummary(issues: VideoQualityIssue[]): string {
  return issues
    .slice(0, 8)
    .map((issue) => `${issue.targetLabel}：${issue.message}`)
    .join('；')
}

/** 把状态快照变成一组执行器。快照是只读入参——执行器改不到真东西 */
export function createToolExecutors(
  state: AgentState,
): Record<string, (args: Record<string, unknown>) => ToolResult> {
  const stepLine = (Object.keys(STEP_LABEL) as StepKey[])
    .map((k) => `${STEP_LABEL[k]}${state.completed[k] ? '✓' : '✗'}`)
    .join(' ')

  return {
    get_active_skill: () => {
      const skill = state.skill
      if (!skill) {
        return { ok: true, content: '当前项目没有绑定个人 Skill；按六步工作流和项目事实执行。' }
      }
      return {
        ok: true,
        content: [
          `当前 Skill：${skill.name} · v${skill.version}`,
          skill.summary ? `摘要：${skill.summary}` : '',
          Object.keys(skill.stageRules).length > 0
            ? `阶段规则：${Object.entries(skill.stageRules)
                .map(([stage, rule]) => `${stage}=${rule}`)
                .join('；')}`
            : '',
          skill.acceptance.length > 0 ? `验收：${skill.acceptance.join('；')}` : '',
          '注意：Skill 是创作方法，不能替代项目当前快照、Canon 或用户确认。',
        ].filter(Boolean).join('\n'),
      }
    },
    list_localization_branches: () => {
      const branches = state.localizationBranches ?? []
      if (branches.length === 0) return { ok: true, content: '当前项目还没有海外本地化分支。' }
      return {
        ok: true,
        content: branches.map((branch) =>
          `${branch.name}｜${branch.market} / ${branch.locale}｜${branch.status}`
        ).join('\n'),
      }
    },
    get_localization_context: (args) => {
      const branchId = String(args?.branchId ?? '').trim()
      const branch = (state.localizationBranches ?? []).find((item) => item.id === branchId)
      if (!branch) return { ok: false, content: '海外分支不存在，不能编 branchId。' }
      const context = state.localizationContext?.branchId === branchId
        ? state.localizationContext
        : null
      if (!context) return { ok: true, content: `${branch.name} 还没有保存市场与改编上下文。` }
      const audit = state.localizationAudit
      return {
        ok: true,
        content: [
          `${branch.name}｜${context.market} / ${context.locale}`,
          `平台：${context.platforms.join('、') || '未填写'}`,
          `受众：${context.audience || '未填写'}`,
          `改编策略：${context.strategy || '未填写'}`,
          audit
            ? `审计：${audit.blocking} 个阻断，${audit.warning} 个提醒${audit.issues.length ? `；${audit.issues.slice(0, 5).join('；')}` : ''}`
            : '审计：尚未运行',
        ].join('\n'),
      }
    },
    get_entity_comments: (args) => {
      const targetType = String(args?.targetType ?? '')
      const targetId = String(args?.targetId ?? '')
      if (targetId && !targetType) return { ok: false, content: 'targetId 必须和 targetType 一起使用。' }
      const comments = (state.entityComments ?? []).filter((comment) =>
        (!targetType || comment.targetType === targetType)
        && (!targetId || comment.targetId === targetId)
      )
      if (comments.length === 0) return { ok: true, content: '当前筛选条件下没有批注。' }
      return {
        ok: true,
        content: comments.map((comment) =>
          `${comment.status === 'open' ? '待处理' : '已解决'}｜${comment.targetName}｜${comment.body}`
        ).join('\n'),
      }
    },
    propose_entity_edit: (args) => {
      const targetType = String(args?.targetType ?? '')
      const targetId = String(args?.targetId ?? '').trim()
      const newText = String(args?.newText ?? '').trim()
      const summary = String(args?.summary ?? '').trim()
      const rawField = String(args?.field ?? '')
      const allowed = new Set<AgentEntity['type']>(['character', 'place', 'episode', 'shot'])
      if (!allowed.has(targetType as AgentEntity['type'])) {
        return { ok: false, content: 'targetType 只能是 character / place / episode / shot。' }
      }
      if (!targetId) return { ok: false, content: 'targetId 不能为空。' }
      const entity = (state.entities ?? []).find((item) =>
        item.type === targetType && item.id === targetId
      )
      if (!entity) return { ok: false, content: `当前项目没有该${targetType}实体，不要编 id。` }
      if (!newText || !summary) return { ok: false, content: 'newText 和 summary 都不能为空。' }
      const defaultField = entity.type === 'character'
        ? 'personality'
        : entity.type === 'place'
          ? 'space'
          : entity.type === 'episode'
            ? 'synopsis'
            : 'action'
      const field = (rawField || defaultField) as AgentEditableField
      const allowedField = entity.type === 'character'
        ? 'personality'
        : entity.type === 'place'
          ? 'space'
          : entity.type === 'episode'
            ? 'synopsis'
            : 'action'
      if (field !== allowedField) {
        return { ok: false, content: `当前${targetType}实体只能修改 ${allowedField}。` }
      }
      return {
        ok: true,
        content: `已生成待确认卡片：${entity.name} · ${summary}（用户确认后才会写入）`,
        card: {
          kind: 'entity-edit',
          targetType: entity.type,
          targetId: entity.id,
          targetName: entity.name,
          field,
          expectedText: entity.fields?.[field] ?? '',
          text: newText,
          summary,
        },
      }
    },
    propose_localization_edit: (args) => {
      const branchId = String(args?.branchId ?? '').trim()
      const targetType = String(args?.targetType ?? '')
      const targetId = String(args?.targetId ?? '').trim()
      const newText = String(args?.newText ?? '').trim()
      const summary = String(args?.summary ?? '').trim()
      const branch = (state.localizationBranches ?? []).find((item) => item.id === branchId)
      if (!branch) return { ok: false, content: '海外分支不存在，不能编 branchId。' }
      if (targetType !== 'episode' && targetType !== 'shot') {
        return { ok: false, content: '本地化修改目标只能是 episode 或 shot。' }
      }
      const target = (state.localizationEntities ?? []).find((item) =>
        item.type === targetType && item.id === targetId
      )
      if (!target) return { ok: false, content: '当前海外分支没有该实体，不要编 targetId。' }
      if (!newText || !summary) return { ok: false, content: 'newText 和 summary 都不能为空。' }
      return {
        ok: true,
        content: `已生成待确认卡片：${branch.name} · ${target.name} · ${summary}`,
        card: {
          kind: 'localization-edit',
          branchId,
          targetType: target.type,
          targetId: target.id,
          targetName: target.name,
          text: newText,
          summary,
        },
      }
    },
    get_project_status: () => {
      const b = state.brief
      const todos = buildTodoList({
        completed: state.completed,
        shots: state.shots,
        expiredShots: state.expiredShots,
        hasIdea: state.hasIdea,
      })
      const contractFacts = [
        b.premise ? `故事承诺：${b.premise}` : '',
        b.payoff ? `追看回报：${b.payoff}` : '',
        b.destination ? `最终落点：${b.destination}` : '',
        b.emotion ? `核心情绪：${b.emotion}` : '',
        b.audience ? `目标观众：${b.audience}` : '',
        b.references ? `参考气质：${b.references}` : '',
        b.redline ? `不要变成：${b.redline}` : '',
      ].filter(Boolean)
      const briefLine = contractFacts.length > 0
        ? `创作契约：${contractFacts.join('；')}`
        : ''
      const logLine = state.judgments.length > 0
        ? `最近的判断：${state.judgments
            .slice(-3)
            .map((j) => `${j.action}${j.reason ? `（${j.reason}）` : ''}`)
            .join('；')}`
        : ''
      return {
        ok: true,
        content: [
          `项目『${state.projectTitle || '未命名'}』：${stepLine}。分镜共 ${state.shots.length} 镜。`,
          state.videoReadiness
            ? `视频：共 ${state.videoReadiness.totalShots} 镜，${state.videoReadiness.videoReady} 镜已有采用视频；${state.videoReadiness.missingFrame} 镜缺首帧，${state.videoReadiness.missingVideo} 镜缺视频；${state.videoReadiness.activeTasks} 个视频任务进行中，${state.videoReadiness.failedTasks} 个视频任务异常。`
            : '',
          todos.length > 0 ? `待处理：${todos.map((item) => item.text).join('；')}` : '当前没有待处理项。',
          briefLine,
          logLine,
          state.decisions.length > 0
            ? `最近决策：${state.decisions.slice(0, 3).map((item) =>
                `${item.question}→${item.chosenValue}${item.locked ? '（已锁定）' : ''}`
              ).join('；')}`
            : '',
        ].filter(Boolean).join('\n'),
      }
    },

    list_edit_targets: (args) => {
      const rawType = String(args?.targetType ?? '')
      const allowed = new Set<AgentEntity['type']>(['character', 'place', 'episode', 'shot'])
      if (rawType && !allowed.has(rawType as AgentEntity['type'])) {
        return { ok: false, content: 'targetType 只能是 character / place / episode / shot。' }
      }
      const entities = (state.entities ?? []).filter((entity) =>
        !rawType || entity.type === rawType
      )
      if (entities.length === 0) {
        return { ok: true, content: rawType ? `当前项目没有${rawType}实体。` : '当前项目没有可修改实体。' }
      }
      return {
        ok: true,
        content: entities
          .slice(0, 40)
          .map((entity) => `${entity.id}｜${entity.type}｜${entity.name}`)
          .concat(entities.length > 40 ? [`另有 ${entities.length - 40} 个目标未展开。`] : [])
          .join('\n'),
      }
    },

    audit_shots: () => {
      if (state.shots.length === 0) {
        return { ok: true, content: '还没有分镜，所以没有可审计的镜头。' }
      }
      const review = reviewShots(state.shots, state.expiredShots)
      const { missing, missingNames: names, rework } = review
      const parts = [`分镜共 ${state.shots.length} 镜`]
      parts.push(
        missing.length > 0
          ? `${missing.length} 个镜头缺参考图（${missing.map((s) => `第 ${s.shot} 镜`).slice(0, 4).join('、')}｜${names.join('、')}）`
          : '参考图都齐',
      )
      parts.push(state.expiredShots > 0 ? `${state.expiredShots} 个镜头的提示词缺了当前锚点，需要重新生成分镜` : '提示词锚点都对得上')
      parts.push(rework.length > 0 ? `${rework.length} 个镜头标了需返修` : '没有标返修的镜头')
      return { ok: true, content: parts.join('；') + '。' }
    },

    review_episodes: () => {
      const eps = state.episodes
      if (eps.length === 0) {
        return { ok: true, content: '还没有分集，暂时没有可审的内容。' }
      }
      const audit = reviewEpisodes(eps)
      const { empty, short } = audit
      const series = pacingSeries(eps)
      const parts = [`共 ${eps.length} 集`]
      if (empty.length > 0) {
        parts.push(`${empty.length} 集没有钩子（第 ${empty.map((e) => e.number).slice(0, 5).join('、')} 集）`)
      }
      if (short.length > 0) {
        parts.push(`${short.length} 集钩子少于 20 字（第 ${short.map((e) => e.number).slice(0, 5).join('、')} 集）`)
      }
      parts.push(isFlatPacing(series) ? '强度几乎是一条平线，中段容易掉' : pacingHint(series))
      const quality = auditCreativeQuality({
        brief: state.brief,
        characters: state.characters ?? [],
        episodes: eps,
      })
      const extra = quality.issues.filter((issue) =>
        issue.code !== 'empty-hook'
        && issue.code !== 'short-hook'
        && issue.code !== 'flat-pacing'
      )
      if (extra.length > 0) {
        parts.push(`创作体检：${extra.slice(0, 6).map((issue) =>
          `${issue.title}（证据：${issue.evidence}）`
        ).join('；')}`)
      } else {
        parts.push('创作体检未发现其他确定性问题')
      }
      return { ok: true, content: parts.filter(Boolean).join('；') + '。' }
    },

    get_quota: () => {
      if (!state.quota) return { ok: false, content: '创作额度信息暂时读不到（接口没返回）。' }
      if (state.quota.unlimited) {
        return {
          ok: true,
          content: '当前是内部管理账号，平台无限额度；图片、视频、TTS 和 Agent 仍按真实消耗记账，上游供应商限流继续生效。',
        }
      }
      const episodeCount = state.quota.episodeCount ?? DEFAULT_EPISODE_COUNT
      const projectCost = state.quota.projectCost ?? projectQuotaUnits(episodeCount)
      return {
        ok: true,
        content: `今日剩余创作额度 ${state.quota.remaining}/${state.quota.limit} 单位；按 ${episodeCount} 集/部估算，每部约 ${projectCost} 单位，还能跑 ${state.quota.projectsLeft} 部。图片、视频和 Agent 重试共用这份额度。`,
      }
    },

    get_decisions: () => {
      if (state.decisions.length === 0) {
        return { ok: true, content: '还没有结构化决策。' }
      }
      return {
        ok: true,
        content: state.decisions
          .slice(0, 6)
          .map((item) =>
            `[${STEP_LABEL[item.step]}] ${item.question} → ${item.chosenValue || '未选择'}` +
            `${item.reason ? `：${item.reason}` : ''}` +
            `${item.locked ? '（已锁定）' : `（${item.status}）`}`
          )
          .join('\n'),
      }
    },

    audit_canon: () => {
      if (state.canonIssues.length === 0) {
        return { ok: true, content: '当前 Canon 没有发现冲突。' }
      }
      const errors = state.canonIssues.filter((issue) => issue.severity === 'error')
      const warnings = state.canonIssues.filter((issue) => issue.severity === 'warning')
      return {
        ok: true,
        content: [
          `Canon 冲突 ${errors.length} 项，提醒 ${warnings.length} 项。`,
          ...state.canonIssues.slice(0, 6).map((issue) =>
            `${issue.severity === 'error' ? '错误' : '提醒'}｜${issue.message}`
          ),
        ].join('\n'),
      }
    },

    list_source_materials: () => ({
      ok: true,
      content: listSourceMaterials(state.sourceMaterials ?? []),
    }),

    read_source_chunk: (args) => {
      const materialId = String(args?.materialId ?? '').trim()
      const chunk = Number(args?.chunk)
      if (!materialId || !Number.isInteger(chunk) || chunk < 0) {
        return { ok: false, content: 'materialId 和 chunk 必须是有效的原文 id 与非负整数章节索引。' }
      }
      const result = readSourceChunk(state.sourceMaterials ?? [], materialId, chunk)
      return {
        ok: result.ok,
        content: result.ok ? `【${result.title}】\n${result.content}` : result.content,
      }
    },

    search_docs: (args) => {
      const question = String(args?.question ?? '')
      const hits = searchDocs(question)
      if (hits.length === 0) {
        return { ok: true, content: '没有找到相关说明。可以换个说法，或者看 README 的「用法」一节。' }
      }
      return {
        ok: true,
        content: hits.map((h, i) => `${i + 1}. ${h.title}：${h.text}\n   出处：${h.source}`).join('\n'),
      }
    },

    propose_shot_edit: (args) => {
      const targetId = String(args?.targetId ?? '').trim()
      const target = String(args?.target ?? '')
      const newText = String(args?.newText ?? '').trim()
      if (!targetId) {
        return { ok: false, content: 'targetId 不能为空；先调用 list_edit_targets 获取稳定镜头 ID。' }
      }
      const shot = state.shots.find((item) => item.targetId === targetId)
      if (!shot) {
        return { ok: false, content: `当前项目没有镜头 ${targetId}，不要编 targetId。` }
      }
      if (target !== 'prompt' && target !== 'action') {
        return { ok: false, content: 'target 只能是 prompt 或 action。' }
      }
      if (!newText) return { ok: false, content: '改写后的文本不能为空。' }
      const summary = String(args?.summary ?? '').trim() || (target === 'prompt' ? '改写本镜提示词' : '改写本镜动作')
      const targetLabel = `第 ${shot.episode || '?'} 集 · 第 ${shot.shot} 镜 · ${shot.scene || '未命名场景'}`
      return {
        ok: true,
        content: `已生成待确认卡片：${targetLabel} · ${summary}（用户点确认后才会写入，我没有直接改）`,
        card: {
          kind: 'shot-edit',
          targetId,
          shot: shot.shot,
          episode: shot.episode,
          targetLabel,
          target,
          expectedText: shot[target],
          text: newText,
          summary,
        },
      }
    },

    propose_regenerate: (args) => {
      const step = String(args?.step ?? '')
      const reason = String(args?.reason ?? '').trim()
      if (!(step in STEP_LABEL)) {
        return { ok: false, content: 'step 必须是六步之一：characters / acts / episodes / visuals / scenes / shots。' }
      }
      if (!reason) return { ok: false, content: '要说明为什么建议重跑（reason 不能为空）。' }
      return {
        ok: true,
        content: `已生成待确认卡片：建议重新生成「${STEP_LABEL[step as StepKey]}」——${reason}（用户点确认后才会触发）`,
        card: { kind: 'regenerate', step: step as StepKey, stepLabel: STEP_LABEL[step as StepKey], reason },
      }
    },

    propose_decision: (args) => {
      const step = String(args?.step ?? '')
      const question = String(args?.question ?? '').trim()
      const options = Array.isArray(args?.options)
        ? args.options.map((item) => String(item).trim()).filter(Boolean).slice(0, 6)
        : []
      const recommended = String(args?.recommended ?? '').trim()
      const reason = String(args?.reason ?? '').trim()
      if (!(step in STEP_LABEL)) {
        return { ok: false, content: 'step 必须是六步之一。' }
      }
      if (!question) return { ok: false, content: '决策问题不能为空。' }
      if (options.length < 2) return { ok: false, content: '至少需要两个候选方案。' }
      if (!options.includes(recommended)) {
        return { ok: false, content: 'recommended 必须来自 options。' }
      }
      if (!reason) return { ok: false, content: '需要说明推荐理由。' }
      return {
        ok: true,
        content: `已生成待确认决策：${question}；推荐「${recommended}」——${reason}`,
        card: {
          kind: 'decision',
          step: step as StepKey,
          stepLabel: STEP_LABEL[step as StepKey],
          question,
          options,
          recommended,
          reason,
        },
      }
    },
    propose_video_plan: (args) => {
      const shotIds = Array.isArray(args?.shotIds)
        ? [...new Set(args.shotIds.map((item) => String(item).trim()).filter(Boolean))]
        : []
      if (shotIds.length === 0) return { ok: false, content: '至少选择一个镜头。' }
      if (shotIds.length > 12) return { ok: false, content: '一次视频计划最多包含 12 个镜头。' }
      const existing = new Set(state.shots.map((shot) => shot.targetId))
      const missing = shotIds.find((id) => !existing.has(id))
      if (missing) return { ok: false, content: `当前项目没有镜头 ${missing}，不要编 targetId。` }

      const model = String(args?.model ?? '').trim()
      const resolution = String(args?.resolution ?? '').trim()
      const durationSeconds = Math.floor(Number(args?.durationSeconds))
      const budgetLimitMicros = Math.floor(Number(args?.budgetLimitMicros))
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        return { ok: false, content: '视频时长必须是正整数秒。' }
      }
      if (!Number.isFinite(budgetLimitMicros) || budgetLimitMicros <= 0) {
        return { ok: false, content: '预算上限必须是正整数微元。' }
      }
      let estimatedCostMicros: number
      try {
        estimatedCostMicros = estimateVideoCostMicros({
          model,
          resolution,
          duration: durationSeconds,
        }) * shotIds.length
      } catch (error) {
        return {
          ok: false,
          content: error instanceof Error ? error.message : '视频模型或分辨率不支持。',
        }
      }
      if (estimatedCostMicros > budgetLimitMicros) {
        return {
          ok: false,
          content: `预计 ${(estimatedCostMicros / 1_000_000).toFixed(2)} 元，超过预算 ${(budgetLimitMicros / 1_000_000).toFixed(2)} 元。`,
        }
      }
      return {
        ok: true,
        content: `已生成视频预算卡：${shotIds.length} 镜，每镜 ${durationSeconds} 秒，预计 ${(estimatedCostMicros / 1_000_000).toFixed(2)} 元。尚未创建任务。`,
        card: {
          kind: 'video-plan',
          shotIds,
          shotCount: shotIds.length,
          durationSeconds,
          model,
          resolution,
          estimatedCostMicros,
          budgetLimitMicros,
        },
      }
    },
    audit_video_quality: (args) => {
      const rawEpisode = Number(args?.episode)
      const episode = Number.isSafeInteger(rawEpisode) && rawEpisode >= 0
        ? rawEpisode
        : undefined
      if ((state.videoTargets ?? []).length === 0) {
        return { ok: false, content: '当前项目还没有可分镜视频候选，无法质检。' }
      }
      const report = qualityReportFor(state, episode)
      const scope = episode === undefined ? '全部集' : `第 ${episode} 集`
      if (report.issues.length === 0) {
        return {
          ok: true,
          content: `${scope}共 ${report.totalShots} 镜，${report.checkedVideos} 条已采用视频的时长、画幅和文件元数据未发现异常。`,
        }
      }
      return {
        ok: true,
        content: `${scope}共 ${report.totalShots} 镜：${report.blockedShots} 镜阻断、${report.warningShots} 镜提醒。${videoIssueSummary(report.issues)}`,
      }
    },
    propose_video_rework: (args) => {
      const episode = Math.floor(Number(args?.episode))
      const reason = String(args?.reason ?? '').trim()
      if (!Number.isSafeInteger(episode) || episode < 0) {
        return { ok: false, content: '集号不正确。' }
      }
      if (!reason) return { ok: false, content: '返修原因不能为空。' }
      const requested = Array.isArray(args?.shotIds)
        ? new Set(args.shotIds.map((item) => String(item).trim()).filter(Boolean))
        : null
      const report = qualityReportFor(state, episode)
      const issues = report.issues.filter((issue) =>
        requested === null || requested.has(issue.shotId)
      )
      if (issues.length === 0) {
        return { ok: false, content: `第 ${episode} 集没有需要返修的视频候选。` }
      }
      const grouped = new Map<string, { shotId: string; targetLabel: string; reasons: string[] }>()
      for (const issue of issues.slice(0, 30)) {
        const current = grouped.get(issue.shotId) ?? {
          shotId: issue.shotId,
          targetLabel: issue.targetLabel,
          reasons: [],
        }
        if (!current.reasons.includes(issue.message)) current.reasons.push(issue.message)
        grouped.set(issue.shotId, current)
      }
      const items = [...grouped.values()]
      return {
        ok: true,
        content: `已生成视频返修卡：第 ${episode} 集 ${items.length} 镜。尚未创建付费任务，也未自动采用新视频。`,
        card: {
          kind: 'video-rework',
          episode,
          shotIds: items.map((item) => item.shotId),
          items,
          reason,
          summary: `${items.length} 镜需要返修：${reason}`,
        },
      }
    },
    propose_timeline_update: (args) => {
      const episode = Math.floor(Number(args?.episode))
      if (!Number.isSafeInteger(episode) || episode < 0) {
        return { ok: false, content: '集号不正确。' }
      }
      const rawOperations = Array.isArray(args?.operations) ? args.operations : []
      if (rawOperations.length === 0 || rawOperations.length > 12) {
        return { ok: false, content: '时间线提案需要 1-12 个操作。' }
      }
      const episodeShots = new Map(
        state.shots
          .filter((shot) => shot.episode === episode)
          .map((shot) => [shot.targetId, shot]),
      )
      const operations: Array<Record<string, string | number>> = []
      for (const raw of rawOperations) {
        const record = raw && typeof raw === 'object'
          ? raw as Record<string, unknown>
          : {}
        const shotId = String(record.shotId ?? '').trim()
        const type = String(record.type ?? '')
        if (!episodeShots.has(shotId)) {
          return { ok: false, content: `第 ${episode} 集没有镜头 ${shotId || '（空）'}。` }
        }
        if (!['move', 'trim', 'mute', 'unmute'].includes(type)) {
          return { ok: false, content: '时间线操作只能是 move / trim / mute / unmute。' }
        }
        const operation: Record<string, string | number> = { shotId, type }
        if (type === 'move') {
          const position = Math.floor(Number(record.position))
          if (!Number.isSafeInteger(position) || position < 1 || position > episodeShots.size) {
            return { ok: false, content: 'move 操作必须提供合法位置。' }
          }
          operation.position = position
        }
        if (type === 'trim') {
          const inMs = Math.floor(Number(record.inMs))
          const outMs = Math.floor(Number(record.outMs))
          if (
            !Number.isSafeInteger(inMs)
            || !Number.isSafeInteger(outMs)
            || inMs < 0
            || outMs - inMs < 500
          ) {
            return { ok: false, content: 'trim 操作必须提供合法入点和出点，且至少保留 0.5 秒。' }
          }
          operation.inMs = inMs
          operation.outMs = outMs
        }
        operations.push(operation)
      }
      return {
        ok: true,
        content: `已生成第 ${episode} 集时间线提案：${operations.length} 项操作。尚未保存草稿。`,
        card: {
          kind: 'timeline-plan',
          episode,
          operations,
          summary: `${operations.length} 项时间线调整，等待用户确认`,
        },
      }
    },
    propose_voice_bindings: (args) => {
      const rawBindings = Array.isArray(args?.bindings) ? args.bindings : []
      if (rawBindings.length === 0 || rawBindings.length > 30) {
        return { ok: false, content: '音色建议需要 1-30 个角色。' }
      }
      const names = new Set((state.characters ?? []).map((character) => character.name))
      const voices = new Map(SYSTEM_VOICES.map((voice) => [voice.id, voice]))
      const bindings: Array<{ characterName: string; voiceId: string; label: string }> = []
      const seen = new Set<string>()
      for (const raw of rawBindings) {
        const record = raw && typeof raw === 'object'
          ? raw as Record<string, unknown>
          : {}
        const characterName = String(record.characterName ?? '').trim()
        const voiceId = String(record.voiceId ?? '').trim()
        if (!names.has(characterName)) {
          return { ok: false, content: `当前项目没有角色「${characterName}」。` }
        }
        const voice = voices.get(voiceId)
        if (!voice) return { ok: false, content: `系统音色 ${voiceId} 不存在。` }
        if (seen.has(characterName)) continue
        seen.add(characterName)
        bindings.push({ characterName, voiceId, label: voice.label })
      }
      return {
        ok: true,
        content: `已生成音色建议卡：${bindings.length} 个角色。尚未保存绑定。`,
        card: {
          kind: 'voice-plan',
          bindings,
          summary: bindings.map((binding) => `${binding.characterName} → ${binding.label}`).join(' / '),
        },
      }
    },
    propose_tts_batch: (args) => {
      const episode = Math.floor(Number(args?.episode))
      const maxBudgetMicros = Math.floor(Number(args?.maxBudgetMicros))
      if (!Number.isSafeInteger(episode) || episode < 0) {
        return { ok: false, content: '集号不正确。' }
      }
      if (!Number.isSafeInteger(maxBudgetMicros) || maxBudgetMicros <= 0) {
        return { ok: false, content: 'TTS 批量预算必须是正整数微元。' }
      }
      const price = Math.floor(Number(state.ttsPricePer1kCharsMicros))
      if (!Number.isSafeInteger(price) || price <= 0) {
        return { ok: false, content: '平台尚未配置 TTS 价格，不能估算批量费用。' }
      }
      const lines = state.shots.filter((shot) =>
        shot.episode === episode
        && shot.dialogue.trim()
        && shot.speaker.trim()
      )
      if (lines.length === 0) {
        return { ok: false, content: `第 ${episode} 集没有可生成的对白。` }
      }
      const characters = lines.reduce((sum, line) => sum + countSpeechCharacters(line.dialogue), 0)
      const estimatedCostMicros = Math.ceil(characters / 1000 * price)
      if (estimatedCostMicros > maxBudgetMicros) {
        return {
          ok: false,
          content: `预计 ${(estimatedCostMicros / 1_000_000).toFixed(2)} 元，超过预算 ${(maxBudgetMicros / 1_000_000).toFixed(2)} 元。`,
        }
      }
      const boundNames = new Set((state.voiceProfiles ?? []).map((profile) => profile.characterName))
      const unboundLines = lines.filter((line) => !boundNames.has(line.speaker)).length
      return {
        ok: true,
        content: `已生成 TTS 批量卡：第 ${episode} 集 ${lines.length} 句、${characters} 字符，预计 ${(estimatedCostMicros / 1_000_000).toFixed(2)} 元。尚未创建付费任务。`,
        card: {
          kind: 'tts-plan',
          episode,
          shotIds: lines.map((line) => line.targetId),
          lineCount: lines.length,
          characters,
          estimatedCostMicros,
          maxBudgetMicros,
          unboundLines,
          summary: `${lines.length} 句 / ${characters} 字符${unboundLines > 0 ? ` / ${unboundLines} 句音色未确认` : ''}`,
        },
      }
    },
    propose_episode_render: (args) => {
      const episode = Math.floor(Number(args?.episode))
      if (!Number.isSafeInteger(episode) || episode < 0) {
        return { ok: false, content: '集号不正确。' }
      }
      const version = (state.timelineVersions ?? []).find((item) => item.episode === episode)
      const targets = (state.videoTargets ?? []).filter((target) => target.episode === episode)
      const videoReady = targets.filter((target) => target.selectedVideoAssetId).length
      const totalShots = version
        ? version.readyCount + version.blockedCount
        : targets.length
      const readyCount = version?.readyCount ?? videoReady
      const blockedCount = version?.blockedCount ?? Math.max(0, totalShots - readyCount)
      const issueCount = version?.issueCount ?? blockedCount
      const totalDurationMs = version?.totalDurationMs
        ?? targets.reduce((sum, target) => sum + target.duration * 1000, 0)
      if (totalShots === 0) {
        return { ok: false, content: `第 ${episode} 集还没有镜头，不能生成成片提案。` }
      }
      const versionText = version ? `v${version.revision}` : '尚未固化版本'
      return {
        ok: true,
        content: `已生成第 ${episode} 集成片提案：${readyCount}/${totalShots} 镜可渲染，${versionText}。${issueCount > 0 ? `${issueCount} 项预检问题，` : ''}尚未加入渲染队列。`,
        card: {
          kind: 'render-plan',
          episode,
          versionId: version?.versionId ?? null,
          revision: version?.revision ?? null,
          readyCount,
          totalShots,
          blockedCount,
          issueCount,
          totalDurationMs,
          summary: `${readyCount}/${totalShots} 镜 · ${versionText} · ${issueCount} 项问题`,
        },
      }
    },
  }
}
