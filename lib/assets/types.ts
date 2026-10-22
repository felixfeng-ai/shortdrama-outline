// 资产层的共享类型。
//
// 与 lib/types.ts 的分工：
//   lib/types.ts     —— 页面/接口的「创作产物」类型（人物、三幕、分集…）
//   本文件            —— 「资产链」的类型（项目、快照、图台账、镜头、锚点）
//
// 之所以分开：创作产物是「一次生成的输出」，资产链是「跨版本长期存在的东西」，
// 后者要进 SQLite，字段稳定性要求更高。

export type EntityId = string

/** 与 lib/assets/repo.ts 的 ArtifactKind 保持一致 */
/**
 * 快照类型清单：**唯一来源**。
 *
 * 为什么必须是运行时数组而不是一个 union：它要同时喂给三个地方——
 * 快照接口的白名单、导出清单、刷新时的恢复逻辑。以前这三处各写一遍，
 * 结果是新增 `visualPlaces` 时接口白名单漏了，恢复逻辑的 Promise.all 整体 400，
 * 「刷新可续」对所有项目静默失效（用户看不到任何报错，只是每次打开都空）。
 * 类型和值都从这里出，新增一个 kind 只需要动这一行。
 */
export const ARTIFACT_KINDS = [
  "idea", "characters", "acts", "episodes",
  "visualCharacters", "scenes", "visualPlaces", "shots",
] as const

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]

/**
 * 角色视觉锚点。
 *
 * 整个产品的技术核心：这些字段是「固定项」，会被编译成英文 anchor 串，
 * 逐字复用到该角色出场的每一个镜头 prompt 里。
 * 拆成多个字段而不是一个大字符串，是为了让用户能单改一项（比如只换外套），
 * 并由影响范围查询精确算出「哪些镜头需要更新」。
 */
export const VISUAL_TRAIT_KEYS = [
  "age", "face", "hair", "marks", "wardrobe", "props",
] as const
export type VisualTraitKey = (typeof VISUAL_TRAIT_KEYS)[number]

/** 身份相关字段默认锁定；服装与道具允许随场景变化 */
export const DEFAULT_LOCKED_VISUAL_TRAITS: readonly VisualTraitKey[] = [
  "age", "face", "hair", "marks",
]

export interface VisualCharacter {
  id: EntityId
  /**
   * 对应核心人物的稳定身份。旧快照可能没有；新生成的数据必须写入。
   * 名称可改，entityId 不跟显示名一起漂移。
   */
  entityId?: EntityId
  /** 跨镜必须保持的禁改项；旧快照缺省时按默认四项处理 */
  lockedTraits?: VisualTraitKey[]
  /** 关联的叙事角色名（对应 lib/types.ts 的 Character.name） */
  name: string
  age: string        // 年龄，如「28岁」
  face: string       // 脸型五官，如「偏长脸、窄眼」
  hair: string       // 发色发型，如「黑色短发、齐耳」
  marks: string      // 辨识特征，如「左眉尾浅疤」
  wardrobe: string   // 服装，如「沙色短夹克」
  props: string      // 随身道具，如「钴蓝色硬壳笔记本」
  /** 编译好的英文锚点串，逐镜复用；可由 anchors.ts 生成，也可手改 */
  anchor: string
}

/** 场次：一场戏，是分镜的输入单位 */
export interface Scene {
  id: EntityId
  number: number
  episode: number       // 属于第几集
  location: string      // 地点
  timeOfDay: string     // 时间（日/夜/黄昏…）
  summary: string       // 这场发生了什么
  characters: string[]  // 出场角色名
}

/**
 * 地点视觉锚点。
 *
 * 为什么是**地点**而不是**场次**：一部剧 40 场戏，真实地点可能只有 8-12 个——
 * 「简南办公室」会在第 1、3、7 集各出现一次。锚点挂在场次上，同一个房间
 * 就会拿到三份不同的描述。角色锚点解决的就是这个问题，地点同理。
 *
 * 没有它的时候，`Shot.prompt` 里的环境是模型每次自由写的：同一个房间
 * 在第 2 镜是「an office with a cold desk lamp」，在第 15 镜变成
 * 「a modern office with floor-to-ceiling windows」——脸保住了，房间每镜在变。
 */
export interface VisualPlace {
  id: EntityId
  /** 地点名，必须与 Scene.location 完全一致——系统靠它把锚点挂到镜头上 */
  name: string
  space: string      // 空间与结构，如「老式车间、裸露水泥柱、两排熔炉」
  props: string      // 陈设与道具，如「角落一个封存的铁皮配方柜」
  lighting: string   // 光线条件，如「顶部单排白炽灯，夜间只留值班灯」
  grade: string      // 色调氛围，如「冷青底子、炉火处偏橙」
  /** 编译好的英文锚点串，逐镜复用；可由 anchors.ts 生成，也可手改 */
  anchor: string
}

/** 镜头状态：用于「返修雷达」 */
export type ShotStatus = "todo" | "done" | "rework"

/** 运镜枚举。固定值，防止模型写成「缓慢推进让人感到紧张」这类自由文本 */
/**
 * 景别与运镜是两个字段，不能混。
 *
 * 混在一起的代价是真实的：出图的人按「运镜」去选「中景」，
 * 提示词里就会带一个错的运镜语义，而同框角色的构图又少了景别约束。
 */
export const SHOT_SIZES = ["特写", "近景", "中景", "全景", "远景"] as const
export type ShotSize = (typeof SHOT_SIZES)[number]

export const CAMERA_MOVES = ["固定", "推", "拉", "摇", "移", "跟随"] as const
export type CameraMove = (typeof CAMERA_MOVES)[number]

/**
 * 单镜时长（秒）的合法档位。
 *
 * 为什么是枚举而不是自由输入：出视频平台只认固定档位——即梦视频 3.0 的 frames
 * 只接受 121（5 秒）和 241（10 秒），可灵同样是 5/10 两档。
 *
 * 以前这里是 1-30 的自由数字框，用户填 7 秒照样能导出，到了平台才被拒收。
 * 「照单执行」断在最后一步，而用户会以为是自己填错了。
 */
export const SHOT_DURATIONS = [5, 10] as const
export type ShotDuration = (typeof SHOT_DURATIONS)[number]

/**
 * 新镜头的默认时长。
 *
 * 为什么是 10 而不是 5：一部 10 集剧约 900 秒。按 5 秒/镜要 180 个镜头，
 * 而分镜那一步是**一次调用产出全部镜头**的——实测每镜约 152 token，
 * 180 镜就是 27,360，超过 `maxTokens` 的 24,000，会被拦腰截断。
 * 10 秒/镜只要 90 镜（13,680 token），装得下。
 *
 * 5 秒档仍然可选：快节奏的强冲突戏需要碎切。这只是默认值，不是唯一值。
 */
export const DEFAULT_SHOT_DURATION: ShotDuration = 10

/**
 * 时长是否落在平台认的档位上。
 *
 * 旧数据里可能存着 7 这类值，界面要把它**显示出来并标注**，
 * 不能静默改成 5 秒——用户以为改过了，实际是被人替他改了。
 */
export function isSupportedDuration(value: number): boolean {
  return (SHOT_DURATIONS as readonly number[]).includes(value)
}

/** 镜头 */
export interface Shot {
  id: EntityId
  /** 跨版本稳定的身份：同一镜头在 v1/v2 中保持一致，便于对比「改了什么」 */
  entityId: EntityId
  shot: number
  /**
   * 这一镜属于第几集。0 = 未标注。
   *
   * 为什么必须有：分镜本来就是**全剧**的（场次覆盖 10 集，镜头铺满全部场次），
   * 但集号以前只存在于 Scene 上、不进 Shot，于是 prompts.csv / 执行单 / 离线分镜表
   * 全都没有集号——一部剧几十张卡片平铺着，用户分不清哪几镜属于哪一集，
   * 量少的时候会直接以为「这是我这一集的分镜」。
   * 旧快照没有这个字段，读取时回落成 0，界面不显示，而不是假装是第 1 集。
   */
  episode: number
  scene: string
  characters: string[]
  action: string
  /**
   * 说话人。空串 = 这一镜没有人说话（纯画面镜头）。
   *
   * 「旁白」也是一种 speaker——漫剧大量依赖旁白推进，不能只认角色名。
   */
  speaker: string
  /**
   * 台词原文（中文）。空串 = 没有台词。
   *
   * 为什么平台要产它：拿「下游工具能不能自己填上」量一遍——音频剪映能做、
   * 剪辑剪映能做，但「这一镜谁说了什么」即梦不知道你的剧情、剪映不认识你的角色，
   * 谁都填不上。所以台词是整条链上唯一一个下游拿不到、又必须有的输入。
   *
   * 边界：只产**文本**。TTS / 数字人 / 对口型都在下游，平台不碰音频。
   */
  dialogue: string
  /**
   * 所属地点的名称，必须与 `Scene.location` 完全一致。空串 = 未标注。
   *
   * 用它把「地点视觉锚点」挂到镜头上——地点不像角色那样有 `characters` 数组可查，
   * 只能靠模型把场次列表里的地点名照抄下来，再由系统按名字精确匹配。
   * 匹配不上就不注入：宁可这一镜没有地点锚点，也不能挂错房间。
   */
  place: string
  /** 景别：决定这一镜把人放多远 */
  shotSize: string
  /** 运镜：决定镜头怎么动 */
  camera: string
  /** 英文提示词，内部必须逐字包含出场角色的 anchor */
  prompt: string
  /** 本镜该带哪几张角色参考图（由 characters 查 VisualCharacter + RefImageMeta 得出） */
  refImages: string[]
  /** 缺参考图的角色名。非空时界面要显式提示，不能静默 */
  missingRefFor: string[]
  params: { ratio: string; duration: number; lastFrame: boolean }
  status: ShotStatus
}

/** 图台账：只有引用与指纹，绝不含图像二进制（原则 P1） */
export interface RefImageMeta {
  id: EntityId
  projectId: EntityId
  /** 本地图库内的相对路径（Chrome/Edge）或 IndexedDB 的 key（降级） */
  vaultKey: string
  label: string
  /** sha-256，用来检测「图被替换/缺失」，不存图也能验 */
  fileHash: string
  mime: string
  bytes: number
  /**
   * 归属类型。`place` 用来挂「场景参考图」——地点和角色一样需要跨镜一致，
   * 只是它的图是按地点去重的，不是按镜头。
   */
  ownerType: "character" | "place" | "shot"
  ownerId: EntityId
  createdAt: number
}
