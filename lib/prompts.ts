// 三个步骤的 Prompt 模板。
// 全部集中在这里：改提示词不用碰路由和界面代码。
// 每个 builder 返回 { system, user }，分别对应 DeepSeek 的 system / user 消息。

// 注意带 .ts 后缀：这个文件现在要 import 值（GENRES），
// 测试跑的是 node 原生 ESM，解析器不猜扩展名（写 './types' 会 ERR_MODULE_NOT_FOUND）
import { GENRES, type Act, type Character, type Genre } from './types.ts'

/** 三步共用的角色设定，保证输出口径一致 */
const MAX_IDEAS = 3

const ROLE = '你是一位资深短剧编剧，操盘过数十部竖屏短剧，深谙 1-3 分钟/集的强节奏叙事。'

/** 统一的输出纪律，附在每个 system 末尾 */
const JSON_RULE = `
## 输出要求（严格遵守）
1. 只输出一个 JSON 对象，不要任何解释、前言、markdown 代码围栏
2. 所有文本用简体中文
3. 字段名必须与下方模板完全一致，不要增删字段
4. 不要输出 null，没有内容就写合理的简短描述`

/**
 * 把风格拼成一段可复用的 prompt 片段。
 *
 * 为什么单独抽出来：风格要注入五个 builder，散着写迟早漏一个。
 * 风格为「不限」时返回空串，提示词里不会多出一句废话。
 */
export function genreClause(genre?: Genre): string {
  if (!genre || !genre.hint) return ''
  return `\n\n## 题材风格（必须贯穿全文）\n本剧属于「${genre.label}」类：${genre.hint}。\n所有设定、冲突与台词都要贴合这个风格，不要跑偏。`
}

// ─────────────────── 第零步：关键词联想候选想法 ───────────────────

/**
 * 题材候选清单（id=中文名），给模型挑推荐题材用。
 * 传 id 而不是中文名，是因为回传的 id 要能直接点亮界面上的题材标签。
 */
export function genrePickerList(genres: Genre[]): string {
  return genres
    .filter((g) => g.id !== 'none')
    .map((g) => `${g.id}=${g.label}`)
    .join('、')
}

/** 一次最多认几个推荐题材：多于 3 个就不像「推荐」了 */
export const MAX_RECOMMENDED_GENRES = 3

/**
 * 解析模型给的题材推荐：只认清单里真实存在的 id，最多 3 个、去重。
 *
 * 模型偶尔会回中文名或自造 id——那种一律丢掉。宁可界面上没有角标，
 * 也不能点亮一个点不了的标签：角标必须能对上题材，才配叫「AI 推荐」。
 */
export function readRecommendedGenres(raw: unknown): string[] {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const list = Array.isArray(src.genres) ? src.genres : []
  const valid = new Set(GENRES.map((g) => g.id).filter((id) => id !== 'none'))
  const picked: string[] = []
  for (const item of list) {
    const id = typeof item === 'string' ? item.trim() : ''
    if (valid.has(id) && !picked.includes(id)) picked.push(id)
    if (picked.length >= MAX_RECOMMENDED_GENRES) break
  }
  return picked
}

/**
 * 用户只给几个关键词时，先联想出几个完整的「一句话想法」供挑选。
 *
 * 为什么不直接把关键词丢给人物生成：一句话想法是整个六步链条的唯一输入，
 * 后面所有 prompt 都基于它。让它保持「一句人话」的形态，下游才不用改。
 */
export function buildIdeaPrompt(keywords: string, genre?: Genre, pickable: Genre[] = []) {
  const system = `${ROLE}

你的任务：用户只给了几个关键词，还没想好完整的故事。请联想出 ${MAX_IDEAS} 个**不同方向**的一句话故事想法，供他挑选。

## 生成要求
- 每个想法必须是**一句完整的话**，能独立讲清主角 + 处境 + 钩子，50 字以内
- 三个想法要**走不同的路子**：不同的主角身份、不同的冲突类型、不同的情绪走向，不要三个都是同一种模板
- 主角身份要**落到具体职业或具体关系**上（快递员、夜班护士、被顶替的考生……），不要用「一个年轻人」这种模糊说法
- 钩子要具体可演，避免「陷入困境」「面临抉择」这类空话
- reason 用一句话说清这个想法的**看点在哪**（15 字以内），帮用户快速判断
- 严格基于用户给的关键词联想，不要把关键词丢了

## JSON 模板
{
  "ideas": [
    {
      "title": "一句话故事想法，50 字以内，主角 + 处境 + 钩子",
      "reason": "看点，15 字以内"
    }
  ],
  "genres": ["你在上面这些想法里最贴合的题材 id"]
}
${pickable.length > 0 ? `
## genres 字段（题材推荐）
- 从下面这份清单里挑 1-3 个和最贴合上面想法的题材，只填 id，不要中文名、不要自造
- 清单：${genrePickerList(pickable)}
- 这是给用户界面点亮的推荐标签，宁缺毋滥：只有一个明显贴合就只给一个
` : ''}
 注意：ideas 数组必须正好 ${MAX_IDEAS} 个元素。${JSON_RULE}${genreClause(genre)}`

  const user = `关键词：${keywords}

请基于这些关键词联想 ${MAX_IDEAS} 个不同方向的一句话故事想法，并给出最贴合的题材。`
  return { system, user }
}

// ─────────────────────── 第一步：核心人物 ───────────────────────

export function buildCharacterPrompt(idea: string, genre?: Genre) {
  const system = `${ROLE}

你的任务：根据用户的一句话故事想法，设计 3-5 个核心角色。

## 设计要求
- 角色之间必须有**天然的对立关系**（利益冲突、立场冲突或情感冲突），不能是各演各的
- 每个角色都要有**明确的、可被剧情推动的动机**，不能只是"好人""坏人"的标签
- 人物弧光写清楚：他/她**从什么状态变成什么状态**，以及是什么事件促成的转变
- 性格要具体到能指导表演，用行为倾向描述（例如"遇事先算账、被逼急了才失控"），不要用"善良""勇敢"这类空词
- 至少包含 1 个主角、1 个对手，其余按剧情需要配置

## JSON 模板
{
  "characters": [
    {
      "name": "角色姓名（要像真人名，不要用'主角'这类代称）",
      "identity": "身份 / 职业 / 社会关系，30 字以内",
      "personality": "性格，60 字以内，写到能指导表演的行为倾向",
      "motivation": "核心动机，60 字以内，说明他/她最想要什么、为什么",
      "arc": "人物弧光，80 字以内，写清从什么状态到什么是状态、被什么事件促成"
    }
  ]
}${JSON_RULE}${genreClause(genre)}`

  const user = `故事想法：${idea}

请设计 3-5 个核心角色。注意：角色要能撑起 10 集的冲突，动机之间要互相咬合。`
  return { system, user }
}

/**
 * 第一步的变体：只重新生成一个角色。
 * 用在「某个角色不满意，单独换一个」的场景，会要求新角色与现有阵容互补。
 */
export function buildSingleCharacterPrompt(idea: string, existing: Character[], genre?: Genre) {
  const roster =
    existing.length > 0
      ? existing.map((c) => `- ${c.name}（${c.identity}）：动机是「${c.motivation}」`).join('\n')
      : '（暂无）'

  const system = `${ROLE}

你的任务：根据用户的一句话故事想法，**再补一个**核心角色。

## 设计要求
- 这个新角色必须与已有角色形成**新的冲突或牵制关系**，不能与已有角色的功能重复
- 不要使用已有角色的名字
- 要有明确的、可被剧情推动的动机
- 人物弧光写清：他/她**从什么状态变成什么状态**，以及是什么事件促成的转变
- 性格用行为倾向描述，不要用"善良""勇敢"这类空词

## JSON 模板
{
  "characters": [
    {
      "name": "角色姓名",
      "identity": "身份 / 职业 / 社会关系，30 字以内",
      "personality": "性格，60 字以内",
      "motivation": "核心动机，60 字以内",
      "arc": "人物弧光，80 字以内"
    }
  ]
}
注意：characters 数组只放 1 个角色。${JSON_RULE}${genreClause(genre)}`

  const user = `故事想法：${idea}

已有的角色：
${roster}

请补充 1 个与上述角色能产生冲突的新角色。`
  return { system, user }
}

// ─────────────────────── 第二步：三幕大纲 ───────────────────────

export function buildActPrompt(idea: string, characters: Character[], genre?: Genre) {
  const roster = characters
    .map((c) => `- ${c.name}（${c.identity}）：动机是「${c.motivation}」；弧光是「${c.arc}」`)
    .join('\n')

  const system = `${ROLE}

你的任务：基于已有的人物设定，写出标准三幕结构的短剧大纲。

## 三幕结构要求
- **第一幕 · 铺垫**：交代主角的处境与欲望，抛出打破平衡的"催化剂事件"，在第一幕结尾把主角推进无法回头的境地
- **第二幕 · 冲突**：对抗升级，主角主动出击却遭遇更大阻力，中点出现重大反转，第二幕结尾是最大的低谷
- **第三幕 · 结局**：高潮对决，主角用成长后的方式解决核心矛盾，收束并给出情绪落点

## 写法要求
- 每一幕的 summary 说清「谁做了什么、导致了什么」，不要写成主题概括
- beats 是这一幕的 3-4 个关键情节点，按时间顺序排列，每个情节点都要有具体的动作或事件
- 情节点必须基于已有的人物动机推进，不要引入凭空出现的新角色
- 反转要有铺垫，不能为了反转而反转

## JSON 模板
{
  "acts": [
    {
      "key": "setup",
      "title": "第一幕 · 铺垫",
      "summary": "这一幕的剧情梗概，100-150 字，写清谁做了什么、导致什么",
      "beats": ["情节点1", "情节点2", "情节点3"]
    },
    { "key": "conflict", "title": "第二幕 · 冲突", "summary": "...", "beats": ["..."] },
    { "key": "resolution", "title": "第三幕 · 结局", "summary": "...", "beats": ["..."] }
  ]
}
注意：acts 数组必须正好 3 个元素，key 依次为 setup / conflict / resolution。${JSON_RULE}${genreClause(genre)}`

  const user = `故事想法：${idea}

已有的人物设定：
${roster}

请基于以上人物，写出三幕大纲。`
  return { system, user }
}

// ─────────────────────── 第三步：分集剧情 ───────────────────────

export function buildEpisodePrompt(idea: string, characters: Character[], acts: Act[], genre?: Genre) {
  const roster = characters
    .map((c) => `- ${c.name}（${c.identity}）：动机是「${c.motivation}」`)
    .join('\n')

  const structure = acts
    .map((a) => `【${a.title}】${a.summary}\n关键情节点：${a.beats.join('；')}`)
    .join('\n\n')

  const system = `${ROLE}

你的任务：把三幕大纲拆成 10 集竖屏短剧，每集 1-3 分钟。

## 短剧节奏要求（这是重点）
- **每集必须有明确的冲突推进**，不能有一集是纯铺垫或纯过渡
- **结尾钩子必须是"未解决的问题"**：一个新危机爆发、一个秘密被揭开、一个决定被打断、一句反转的台词——让观众非点下一集不可
- 钩子要具体，写清发生了什么，不要写"留下悬念""引发观众好奇"这种描述钩子的话
- 10 集的冲突强度必须递进：第 1 集抓人，第 4-6 集进入中段升级，第 8-10 集连续高潮
- 第 10 集收尾，但钩子可以留一个余味（开放式或反转式结尾）
- 剧情必须严格基于给定的三幕结构推进，按三幕顺序分配到各集

## JSON 模板
{
  "episodes": [
    {
      "number": 1,
      "title": "本集标题，12 字以内，要有信息量不要用'第X集'",
      "synopsis": "剧情梗概，100-140 字，写清本集谁做了什么、冲突如何推进",
      "hook": "结尾钩子，40-60 字，写清最后一秒发生了什么，为什么让人想看下一集"
    }
  ]
}
注意：episodes 数组必须正好 10 个元素，number 从 1 连续到 10。${JSON_RULE}${genreClause(genre)}`

  const user = `故事想法：${idea}

人物设定：
${roster}

三幕大纲：
${structure}

请基于以上内容，生成 10 集分集剧情。`
  return { system, user }
}
