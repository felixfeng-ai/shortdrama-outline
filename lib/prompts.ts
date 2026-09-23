// 三个步骤的 Prompt 模板。
// 全部集中在这里：改提示词不用碰路由和界面代码。
// 每个 builder 返回 { system, user }，分别对应 DeepSeek 的 system / user 消息。

import type { Act, Character } from './types'

/** 三步共用的角色设定，保证输出口径一致 */
const ROLE = '你是一位资深短剧编剧，操盘过数十部竖屏短剧，深谙 1-3 分钟/集的强节奏叙事。'

/** 统一的输出纪律，附在每个 system 末尾 */
const JSON_RULE = `
## 输出要求（严格遵守）
1. 只输出一个 JSON 对象，不要任何解释、前言、markdown 代码围栏
2. 所有文本用简体中文
3. 字段名必须与下方模板完全一致，不要增删字段
4. 不要输出 null，没有内容就写合理的简短描述`

// ─────────────────────── 第一步：核心人物 ───────────────────────

export function buildCharacterPrompt(idea: string) {
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
}${JSON_RULE}`

  const user = `故事想法：${idea}

请设计 3-5 个核心角色。注意：角色要能撑起 10 集的冲突，动机之间要互相咬合。`
  return { system, user }
}

/**
 * 第一步的变体：只重新生成一个角色。
 * 用在「某个角色不满意，单独换一个」的场景，会要求新角色与现有阵容互补。
 */
export function buildSingleCharacterPrompt(idea: string, existing: Character[]) {
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
注意：characters 数组只放 1 个角色。${JSON_RULE}`

  const user = `故事想法：${idea}

已有的角色：
${roster}

请补充 1 个与上述角色能产生冲突的新角色。`
  return { system, user }
}

// ─────────────────────── 第二步：三幕大纲 ───────────────────────

export function buildActPrompt(idea: string, characters: Character[]) {
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
注意：acts 数组必须正好 3 个元素，key 依次为 setup / conflict / resolution。${JSON_RULE}`

  const user = `故事想法：${idea}

已有的人物设定：
${roster}

请基于以上人物，写出三幕大纲。`
  return { system, user }
}

// ─────────────────────── 第三步：分集剧情 ───────────────────────

export function buildEpisodePrompt(idea: string, characters: Character[], acts: Act[]) {
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
注意：episodes 数组必须正好 10 个元素，number 从 1 连续到 10。${JSON_RULE}`

  const user = `故事想法：${idea}

人物设定：
${roster}

三幕大纲：
${structure}

请基于以上内容，生成 10 集分集剧情。`
  return { system, user }
}
