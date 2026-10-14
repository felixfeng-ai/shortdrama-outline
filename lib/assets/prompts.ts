// 视觉锚点 / 场次剧本 / 分镜 三个 Prompt。
//
// 与 lib/prompts.ts 的分工：那里是「创作层」（人物、三幕、分集），
// 这里是「资产层」（定妆、场次、镜头）。
//
// 重要：上游 DeepSeek 目前不支持 response_format: json_schema，
// 实测返回 400 "This response_format type is unavailable now"。
// 因此这里用 json_object + prompt 内嵌字段约束，并在 normalize 阶段做后校验
// （见 lib/assets/normalize.ts 的锚点强制注入）。
import type { Act, Character, Episode, Genre } from "../types.ts"
import { genreClause } from "../prompts.ts"
import { CAMERA_MOVES, type Scene, type VisualCharacter } from "./types.ts"

const ROLE = "你是一位资深短剧美术指导兼分镜师，操盘过数十部竖屏短剧。"

const JSON_RULE = `
## 输出要求（严格遵守）
1. 只输出一个 JSON 对象，不要解释、不要 markdown 围栏
2. 所有文本用简体中文（prompt 字段例外，见各步说明）
3. 字段名必须与模板完全一致，不要增删字段`

// ── 视觉锚点 ───────────────────────────────────────────────────

export function buildVisualPrompt(idea: string, characters: Character[], genre?: Genre) {
  const roster = characters
    .map((c) => `- ${c.name}（${c.identity}）：性格「${c.personality}」`)
    .join("\n")

  const system = `${ROLE}

你的任务：为已有角色做「视觉定妆」，产出可被反复复用的视觉锚点。

## 关键要求
- 每个字段都要具体到能直接画出来，不要写「好看」「有气质」这类空词
- 特征要有辨识度：优先给一个「一眼能记住」的细节（疤痕/痣/眼镜/特定配饰）
- 服装要写颜色 + 材质 + 款式（「沙色棉质短夹克」而不是「夹克」）
- 同一角色在不同镜头必须长得一样，所以字段要写死，不要写「视剧情而定」
- anchor 字段：把上述字段整理成一段英文，格式为
  \`age: ..., face: ..., hair: ..., distinguishing feature: ..., wearing: ..., carrying: ...\`
  只保留有内容的项，用英文逗号分隔

## JSON 模板
{
  "visualCharacters": [
    {
      "name": "角色名（必须与给定角色一致）",
      "age": "年龄，如 28岁",
      "face": "脸型五官，如 偏长脸、窄眼",
      "hair": "发色发型，如 黑色短发、齐耳",
      "marks": "辨识特征，如 左眉尾浅疤",
      "wardrobe": "服装，如 沙色棉质短夹克",
      "props": "随身道具，如 钴蓝色硬壳笔记本",
      "anchor": "英文锚点串，格式见上"
    }
  ]
}
注意：visualCharacters 必须覆盖所有给定角色。${JSON_RULE}${genreClause(genre)}`

  const user = `故事想法：${idea}

角色列表：
${roster}

请为以上每个角色产出视觉定妆。`
  return { system, user }
}

// ── 场次剧本 ───────────────────────────────────────────────────

export function buildScenePrompt(idea: string, characters: Character[], episodes: Episode[], genre?: Genre) {
  const roster = characters.map((c) => `- ${c.name}（${c.identity}）`).join("\n")
  const epList = episodes
    .map((e) => `第 ${e.number} 集《${e.title}》：${e.synopsis}`)
    .join("\n")

  const system = `${ROLE}

你的任务：把分集剧情拆成「场次」。场次是分镜的输入单位，一场戏 = 一个连续时空。

## 拆分原则
- 一个场次必须发生在同一地点、同一时间，地点或时间一换就要另起一场
- 用「地点 + 时间」判断：换场景、跨昼夜都要拆开
- characters 只写这场戏真正出场的角色（不是全剧人物）
- summary 说清「谁在这里做了什么、达成了什么或失败了什么」
- 不要引入给定人物之外的新角色

## JSON 模板
{
  "scenes": [
    {
      "episode": 1,
      "location": "地点，如 咖啡馆内",
      "timeOfDay": "时间，如 黄昏",
      "summary": "这场戏发生了什么，80 字以内",
      "characters": ["出场角色名"]
    }
  ]
}
注意：scenes 按剧情顺序排列，number 由系统按顺序生成，你不需要输出。${JSON_RULE}${genreClause(genre)}`

  const user = `故事想法：${idea}

角色：
${roster}

分集剧情：
${epList}

请把这些剧情拆成场次。`
  return { system, user }
}

// ── 分镜 ───────────────────────────────────────────────────────

export function buildShotPrompt(
  idea: string,
  scenes: Scene[],
  visuals: VisualCharacter[],
  acts: Act[] = [],
  genre?: Genre,
) {
  const roster = visuals
    .map((v) => `- ${v.name}：${v.anchor || "（未设定视觉锚点）"}`)
    .join("\n")

  const sceneList = scenes
    .map((s) => `第 ${s.episode} 集 · 场 ${s.number}【${s.location}·${s.timeOfDay}】${s.summary}\n  出场：${s.characters.join("、") || "（无）"}`)
    .join("\n")

  const structure = acts.length > 0
    ? "\n三幕结构参考：\n" + acts.map((a) => `【${a.title}】${a.summary}`).join("\n") + "\n"
    : ""

  const system = `${ROLE}

你的任务：把场次拆成镜头，并为每个镜头写一条可直接用于图像/视频生成的英文提示词。

## 分镜要求
- 一场戏拆成 2-5 个镜头，镜头之间要有推进关系，不要重复同一画面
- camera 字段只能取以下之一：${CAMERA_MOVES.join(" / ")}
- characters 写本镜真正出场的角色名，必须与给定角色名完全一致

## prompt 字段（最重要）
- 用**英文**写，给图像模型直接使用
- 要素顺序：主体与动作 → 环境与光线 → 构图与运镜 → 风格
- **必须原样嵌入出场角色的视觉锚点串**（一字不改地复制到 prompt 里），
  这是保证跨镜头角色一致的关键，绝对不要改写或省略
- 不要写「same character as before」这类依赖上下文的说法

## JSON 模板
{
  "shots": [
    {
      "scene": "所属场次的简短标识，如 咖啡馆内·黄昏",
      "characters": ["出场角色名"],
      "action": "中文动作描述，说清这一镜在演什么",
      "camera": "运镜（只能取上面列举的值）",
      "prompt": "English prompt with the character anchor strings embedded verbatim"
    }
  ]
}
注意：shots 按剧情顺序排列，shot 编号由系统生成，你不需要输出。${JSON_RULE}${genreClause(genre)}`

  const user = `故事想法：${idea}

角色视觉锚点（必须原样嵌入 prompt）：
${roster}
${structure}
场次：
${sceneList}

请把这些场次拆成镜头。`
  return { system, user }
}

/** 出图提示词：给定锚点，产出中英双语的角色定妆图提示词（纯文本，不调图像 API） */
export function buildImagePrompt(visuals: VisualCharacter[]) {
  const list = visuals
    .map((v) => `- ${v.name}：${v.anchor}`)
    .join("\n")

  const system = `${ROLE}

你的任务：为每个角色写「定妆图」的出图提示词，供即梦/可灵等工具出静态角色参考图。

## 要求
- 每个角色给中英两版，内容一致
- 英文版要含：主体特征 + 正面半身、中性表情、纯色背景、均匀布光 + 画风句
- 画风句统一（保证所有角色画风一致）：cinematic realistic style, high detail
- 不要写场景与动作，定妆图只关注「这个人长什么样」

## JSON 模板
{
  "imagePrompts": [
    { "name": "角色名", "zh": "中文提示词", "en": "English prompt" }
  ]
}${JSON_RULE}`

  const user = `角色视觉锚点：
${list}

请为每个角色写定妆图提示词。`
  return { system, user }
}
