export type SkillCategory =
  | "小说改编"
  | "小说创作"
  | "短剧开发"
  | "视觉一致性"
  | "分镜制作"
  | "交付效率"

export type SkillLibrary = "recommend" | "favorite" | "mine"

export interface SkillDefinition {
  id: string
  title: string
  category: SkillCategory
  type: string
  image: string
  count: string
  summary: string
  meta: string
  favorite: boolean
  visual: "" | "visual-code" | "visual-number"
  prompt: string
  requires: string[]
  produces: string[]
  writePolicy: string
}

export const SKILL_CATALOG: SkillDefinition[] = [
  {
    id: "adaptation",
    title: "小说 / 剧本改编",
    category: "小说改编",
    type: "改编",
    image: "/visuals/premium/night-letter.webp",
    count: "分批读取",
    summary: "拆解章节与人物关系，先把原著圣经和分集计划做对，再进入六步生产。",
    meta: "原文索引 · 实验",
    favorite: true,
    visual: "",
    prompt: "把一部 18 章小说整理成 12 集短剧，先做原著圣经和改编计划。",
    requires: ["小说 / 剧本原文"],
    produces: ["原著圣经", "改编计划"],
    writePolicy: "确认后写入",
  },
  {
    id: "story-doctor",
    title: "故事医生",
    category: "短剧开发",
    type: "审校",
    image: "/visuals/premium/estate-rain.webp",
    count: "追看率",
    summary: "检查钩子、节奏、动机和结构塌陷，输出可以跳转到具体集数的修订清单。",
    meta: "审校 · 1–3 次模型调用",
    favorite: false,
    visual: "visual-code",
    prompt: "检查分集钩子和节奏，指出最影响追看的三个问题。",
    requires: ["分集或三幕大纲"],
    produces: ["节奏诊断", "修订清单"],
    writePolicy: "只读",
  },
  {
    id: "canon",
    title: "人物 Canon 检查",
    category: "视觉一致性",
    type: "检查",
    image: "/visuals/premium/estate-rain.webp",
    count: "连续性",
    summary: "核对人物关系、时间线、地点和道具状态，硬冲突先由确定性规则找出来。",
    meta: "只读 · 低额度",
    favorite: false,
    visual: "visual-code",
    prompt: "检查人物关系、时间线和道具状态，有没有前后矛盾。",
    requires: ["人物、视觉、场次或分镜"],
    produces: ["Canon 冲突清单"],
    writePolicy: "只读优先",
  },
  {
    id: "continuity",
    title: "镜头连续性检查",
    category: "分镜制作",
    type: "分镜",
    image: "/visuals/premium/green-corridor.webp",
    count: "精确定位",
    summary: "检查首尾帧断点、角色锚点、参考图版本和跨场衔接，生成可逐镜处理的返修队列。",
    meta: "确定性优先 · 不自动改",
    favorite: true,
    visual: "visual-code",
    prompt: "检查当前分镜的首尾帧、角色锚点和参考图版本，生成返修计划。",
    requires: ["分镜"],
    produces: ["连续性报告", "逐镜返修队列"],
    writePolicy: "只读",
  },
  {
    id: "delivery",
    title: "平台交付预检",
    category: "交付效率",
    type: "交付",
    image: "/visuals/premium/estate-rain.webp",
    count: "即梦 / 可灵",
    summary: "按目标平台检查时长、画幅、锚点和缺失文件，把阻断项与提醒项直接写进报告。",
    meta: "纯计算 · 0 模型调用",
    favorite: false,
    visual: "visual-code",
    prompt: "按即梦交付规格检查当前项目，并列出阻断项。",
    requires: ["分镜"],
    produces: ["阻断项", "平台交付预检"],
    writePolicy: "纯计算",
  },
  {
    id: "cost",
    title: "成本规划",
    category: "交付效率",
    type: "预算",
    image: "/visuals/premium/green-corridor.webp",
    count: "批次规划",
    summary: "估算批次、重试、参考图和整剧成本，先给出更省的执行顺序，不直接生成图片。",
    meta: "纯计算 · 不生成图片",
    favorite: true,
    visual: "visual-number",
    prompt: "估算 30 集分镜的生成成本，并给出更省的批次顺序。",
    requires: ["分集或分镜"],
    produces: ["成本估算", "批次顺序"],
    writePolicy: "纯计算",
  },
  {
    id: "novelize",
    title: "小说化",
    category: "小说创作",
    type: "长篇扩写",
    image: "/visuals/premium/night-letter.webp",
    count: "复用分集",
    summary: "复用短剧项目的人物、三观、分集、场次与 Canon，按卷章规划扩写长篇连载初稿。",
    meta: "低优先级 · 按章排队",
    favorite: true,
    visual: "visual-code",
    prompt: "把当前短剧项目扩写为 90 章长篇小说初稿，先规划目录和预算。",
    requires: ["分集或场次剧本"],
    produces: ["卷章目录", "小说正文", "章节摘要"],
    writePolicy: "确认后写入独立小说稿",
  },
  {
    id: "novel-deslop",
    title: "小说去 AI 味",
    category: "小说创作",
    type: "改稿",
    image: "/visuals/premium/estate-rain.webp",
    count: "候选修订",
    summary: "先做确定性检查，再只针对命中问题生成候选修订；不新增事实，不自动覆盖正文。",
    meta: "只读检查 · 确认后写入",
    favorite: true,
    visual: "visual-code",
    prompt: "检查当前小说章节的机械句式、重复和工程词，生成候选修订。",
    requires: ["小说章节"],
    produces: ["质检报告", "候选修订"],
    writePolicy: "用户确认后写入新版本",
  },
]

export function filterSkillCatalog(input: {
  library: SkillLibrary
  category?: SkillCategory | "全部"
  query?: string
}): SkillDefinition[] {
  const query = input.query?.trim().toLowerCase() ?? ""
  return SKILL_CATALOG.filter((skill) => {
    if (input.library === "favorite" && !skill.favorite) return false
    if (input.library === "mine") return false
    if (input.category && input.category !== "全部" && skill.category !== input.category) return false
    if (!query) return true
    return `${skill.title} ${skill.summary} ${skill.category}`.toLowerCase().includes(query)
  })
}

export function matchSkillForPrompt(prompt: string): SkillDefinition {
  if (/去\s*AI\s*味|AI\s*味|润色|改稿/i.test(prompt)) {
    return SKILL_CATALOG.find((skill) => skill.id === "novel-deslop") ?? SKILL_CATALOG[0]
  }
  if (/小说化|长篇小说|扩写|连载初稿/.test(prompt)) {
    return SKILL_CATALOG.find((skill) => skill.id === "novelize") ?? SKILL_CATALOG[0]
  }
  if (/小说|剧本|章节|原著/.test(prompt)) return SKILL_CATALOG[0]
  if (/钩子|节奏|故事|结构/.test(prompt)) return SKILL_CATALOG[1]
  if (/人物|关系|道具|时间线/.test(prompt)) return SKILL_CATALOG[2]
  if (/分镜|首尾帧|参考图|镜头/.test(prompt)) return SKILL_CATALOG[3]
  if (/即梦|可灵|导出|交付/.test(prompt)) return SKILL_CATALOG[4]
  if (/成本|预算|批次/.test(prompt)) return SKILL_CATALOG[5]
  return SKILL_CATALOG[1]
}
