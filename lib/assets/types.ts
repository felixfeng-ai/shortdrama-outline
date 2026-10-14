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
export type ArtifactKind =
  | "idea" | "characters" | "acts" | "episodes"
  | "visualCharacters" | "scenes" | "shots"

/**
 * 角色视觉锚点。
 *
 * 整个产品的技术核心：这些字段是「固定项」，会被编译成英文 anchor 串，
 * 逐字复用到该角色出场的每一个镜头 prompt 里。
 * 拆成多个字段而不是一个大字符串，是为了让用户能单改一项（比如只换外套），
 * 并由影响范围查询精确算出「哪些镜头需要更新」。
 */
export interface VisualCharacter {
  id: EntityId
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

/** 镜头 */
export interface Shot {
  id: EntityId
  /** 跨版本稳定的身份：同一镜头在 v1/v2 中保持一致，便于对比「改了什么」 */
  entityId: EntityId
  shot: number
  scene: string
  characters: string[]
  action: string
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
  ownerType: "character" | "shot"
  ownerId: EntityId
  createdAt: number
}
