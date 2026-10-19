// 视觉锚点 / 场次剧本 / 分镜 三个 Prompt。
//
// 与 lib/prompts.ts 的分工：那里是「创作层」（人物、三幕、分集），
// 这里是「资产层」（定妆、场次、镜头）。
//
// 重要：上游 DeepSeek 目前不支持 response_format: json_schema，
// 实测返回 400 "This response_format type is unavailable now"。
// 因此这里用 json_object + prompt 内嵌字段约束，并在 normalize 阶段做后校验
// （见 lib/assets/normalize.ts 的锚点强制注入）。
import { briefPromptBlock, type CreativeBrief } from '../brief.ts'
import type { Act, Character, Episode, Genre } from "../types.ts"
import { genreClause } from "../prompts.ts"
import { CAMERA_MOVES, SHOT_SIZES, type Scene, type VisualCharacter } from "./types.ts"

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
  // 场次下限跟实际集数走：30/60 集的项目不能还按 10 集的 40-60 场来要求
  const epCount = Math.max(1, episodes.length)

  const system = `${ROLE}

你的任务：把分集剧情拆成「场次」。场次是分镜的输入单位，一场戏 = 一个连续时空。

## 拆分原则
- 一个场次必须发生在同一地点、同一时间，地点或时间一换就要另起一场
- 用「地点 + 时间」判断：换场景、跨昼夜都要拆开
- characters 只写这场戏真正出场的角色（不是全剧人物）
- summary 说清「谁在这里做了什么、达成了什么或失败了什么」
- 不要引入给定人物之外的新角色

## 数量要求（最容易做少的地方）
- **每一集至少拆出 4 场**，${epCount} 集就是 ${epCount * 4}-${epCount * 6} 场
- 一集只给 1 场是错的：一集 1-3 分钟里通常要换 4 次以上的地点或时间
- 宁可拆细，不要合并：同一地点但时间跳了（「白天」→「当晚」）也要另起一场
- 拆少了的代价在下游：分镜按「一场 2-5 镜」展开，场次少一半，成片时长就少一半

## 地点视觉锚点（places，与 scenes 并列输出）
- 把上面所有场次的**地点去重**后列出来——同一个地点只列一次，不要按场次重复
- 每个地点四个视觉字段，要具体到能直接画出来，不要写「有氛围」「很旧」这类空词
- **同一个地点只有一份描述**：它在全剧反复出现，描述不一致画面就会穿帮
- name 必须与场次里的 location **一字不差**，系统靠它把锚点挂到镜头上
- anchor 整理成英文，格式为「space: ..., set dressing: ..., lighting: ..., color grade: ...」，
  只保留有内容的项

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
  ],
  "places": [
    {
      "name": "地点名，必须与上面用到的 location 完全一致",
      "space": "空间与结构，如 老式车间、裸露水泥柱、两排熔炉",
      "props": "陈设与道具，如 角落一个封存的铁皮配方柜",
      "lighting": "光线条件，如 顶部单排白炽灯、夜间只留值班灯",
      "grade": "色调氛围，如 冷青底子、炉火处偏橙",
      "anchor": "英文锚点串，格式见上"
    }
  ]
}
注意：scenes 按剧情顺序排列，number 由系统按顺序生成，你不需要输出。
注意：places 是去重后的地点清单，不是场次清单——40 场戏可能只有 8-12 个地点。${JSON_RULE}${genreClause(genre)}`

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
  brief?: CreativeBrief,
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

## 数量要求（最容易做少的地方）
- **每一场戏必须拆出 2-5 个镜头**，一场戏只给一个镜头是错的
- 镜头是成片时长的来源：一集 1-3 分钟，按 5-10 秒一镜算就是 9-36 个镜头，拆少了时长直接不够
- 全片镜头数 ≈ 场次数 × 2~5，请按这个量级交付

## 分镜要求
- 镜头之间要有推进关系，不要重复同一画面
- shotSize（景别）只能取以下之一：${SHOT_SIZES.join(" / ")}——它决定观众离人物多远
- camera（运镜）只能取以下之一：${CAMERA_MOVES.join(" / ")}——它决定镜头怎么动
- 两者不能互相顶替：不要把「中景」写进 camera，也不要把「推」写进 shotSize
- characters 写本镜真正出场的角色名，必须与给定角色名完全一致
- episode 写这一镜属于第几集：从上面场次列表的「第 N 集」照抄，不要自己重新编号
- place 写这一镜的地点：从上面场次列表的【地点·时间】里照抄**地点**那一部分，
  必须与地点锚点清单里的 name 一字不差，系统靠它把地点锚点挂到这一镜

## 台词（每镜都要判断有没有）
- speaker 写这一镜说话的人：必须是本镜出场角色之一，或写「旁白」；**没有人说话就留空串**
- dialogue 写台词原文，中文，**不超过 20 字**——一镜 5 秒，中文语速约 4-5 字/秒，写长了念不完
- 台词要口语、要短、要推动剧情，不要写「（沉默）」「（叹气）」这类舞台提示
- 纯画面镜头（环境交代、动作特写）两个字段都留空，不要为了填满而硬塞台词

## prompt 字段（最重要）
- 用**英文**写，给图像模型直接使用
- 要素顺序：动作与姿态 → 环境与光线 → 景别与运镜 → 风格
- **不要写角色的外貌**（脸型、发型、五官特征、服装、随身道具）。
  外貌由系统在提示词末尾统一注入——你写了不但重复，更糟的是**可能和注入的内容冲突**：
  你写「米色外套」、系统注入「沙色短夹克」，出图时听谁的？这直接毁掉跨镜头一致性
- **不要复述地点的固定特征**（空间结构、陈设、光线基调、色调）——理由同上，
  这些由系统按地点统一注入。只写**这一镜特有的**：角色在空间里的位置与移动、
  当下的动作、这一刻的光影变化
- 提到角色时用姓名（如 Jianan）或身份指代（the technician / the director）即可
- 不要写「same character as before」这类依赖上下文的说法

## JSON 模板
{
  "shots": [
    {
      "scene": "所属场次的简短标识，如 咖啡馆内·黄昏",
      "episode": 1,
      "place": "这一镜的地点（必须与地点锚点清单的 name 一字不差）",
      "characters": ["出场角色名"],
      "action": "中文动作描述，说清这一镜在演什么",
      "speaker": "说话人（出场角色名或「旁白」；没人说话留空）",
      "dialogue": "台词原文，20 字以内（没人说话留空）",
      "shotSize": "景别（只能取上面列举的值，如 中景）",
      "camera": "运镜（只能取上面列举的值，如 固定）",
      "prompt": "English prompt with the character anchor strings embedded verbatim"
    }
  ]
}
注意：shots 按剧情顺序排列，shot 编号由系统生成，你不需要输出。${JSON_RULE}${genreClause(genre)}`

  const user = `故事想法：${idea}

出场角色（外貌由系统统一注入，你只需要知道谁在场，不要在 prompt 里复述）：
${roster}
${structure}
场次：
${sceneList}

请把这些场次拆成镜头。`
  return { system: system + briefPromptBlock(brief), user }
}

/** 出图提示词：给定锚点，产出中英双语的角色定妆图提示词（纯文本，不调图像 API） */
export function buildImagePrompt(visuals: VisualCharacter[]) {
  const list = visuals
    .map((v) => `- ${v.name}：${v.anchor}`)
    .join("\n")

  const system = `${ROLE}

你的任务：为每个角色写「定妆图」的出图提示词，供出图工具（即梦/可灵等）出静态角色参考图。

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

// ── AI 认图（兜底） ─────────────────────────────────────────────
/**
 * 当文件名/目录名里没有可用信息时，让模型判断每张图属于哪个角色。
 *
 * 这是纯字符串推理，不涉及任何图像内容——我们永远不把图片传出去。
 * 模型能用的线索只有：
 *   - 文件/目录名里残留的英文拼音（可能是错拼，如 陈砚 → Cheng Yan）
 *   - 年龄、性别、外貌描述词（34-year-old woman / long face）
 *   - 角色名本身的字义（林望 / 苏瑶）
 *
 * 所以 prompt 的重点是「给依据、允许说不确定」，而不是逼它给满答案：
 * 挂错一张图比不挂更糟——用户会以为垫好图了，去出图才发现脸不对。
 */
export function buildAssetMatchPrompt(
  names: string[],
  files: { key: string; name: string }[],
  genre?: Genre,
) {
  const roster = names.map((n) => `- ${n}`).join("\n")
  const fileList = files.map((f, i) => `${i + 1}. ${f.name}（路径：${f.key}）`).join("\n")

  const system = `你是短剧剧组的制片助理，负责把从出图平台下载的角色图归到正确的角色名下。

## 你能看到的线索
- 文件名：出图平台（即梦等）会把提示词当文件名，里面常常夹着角色的英文拼音名、年龄、性别、外貌描述
- 目录名：可能是中文角色名、拼音大写（JIAN NAN）、或纯序号（1 / 2）
- 角色名列表：这是内部统一用的中文名

## 判断原则
1. **拼音优先**：英文名几乎一定对应某个中文角色的拼音（Jiang Nan → 江楠 / 江南）
2. **允许错拼**：出图平台常有拼写误差（Cheng Yan 其实可能是「陈砚」），按发音最接近、且与列表中角色匹配度最高的来判
3. **外貌描述可作旁证**：34-year-old woman 应归给女性角色，40-year-old man 归给男性中年角色
4. **不确定就不要猜**：如果两张图看起来都像同一个角色、或完全找不到线索，就不要放进结果，留给用户手动挂——挂错比不挂更糟
5. 一张图最多只归一个角色；一个角色可以有多张图

## JSON 模板
{
  "matches": [
    {
      "character": "角色名（必须严格来自给定列表）",
      "key": "文件的完整路径（必须严格来自给定列表）",
      "confidence": "high 或 low",
      "reason": "一句话说明依据，如「文件名含 Jiang Nan 的拼音」"
    }
  ]
}
${JSON_RULE}${genreClause(genre)}`

  const user = `角色列表：
${roster}

待归类的图片：
${fileList}

请判断每张图属于哪个角色。没有把握的不要输出。`

  return { system, user }
}
