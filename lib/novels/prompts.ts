import { briefPromptBlock } from "../brief.ts"
import type {
  NovelChapterRecord,
  NovelGenerationContext,
  NovelGenerationResult,
  NovelSourcePack,
} from "./types.ts"

export const NOVEL_PROMPT_VERSION = "novel-v1"

const SYSTEM = `你是中文长篇小说作者，正在把一部已经完成分集与分镜设计的短剧扩写为可连载小说。

硬性规则：
1. 只写小说正文，不写创作说明、导演注释、镜头说明或制作备注。
2. 不得出现“分镜、景别、运镜、首帧、尾帧、提示词、Prompt、画幅”等制作流程词。
3. 不新增会改变主线的人物、事件、世界观规则或关键事实；可补充生活细节、感官、动作与心理。
4. 对话必须符合人物身份、动机和当前 Canon 状态。
5. 章末必须兑现给定额钩子，但不要把下一章完整写完。
6. 输出严格 JSON：{"title":"章节标题","content":"完整正文","summary":"150字以内摘要"}。
7. content 使用自然中文段落，不要 Markdown 标题，不要小标题。`

function compact<T>(items: T[], limit: number, map: (item: T) => string): string[] {
  return items.slice(0, limit).map(map).filter(Boolean)
}

function sourceBlock(source: NovelSourcePack, chapter: NovelChapterRecord): string {
  const episode = source.episodes.find((item) => item.number === chapter.sourceEpisode)
  const nearbyEpisodes = source.episodes
    .filter((item) => Math.abs(item.number - chapter.sourceEpisode) <= 1)
  const sceneIds = new Set(chapter.sourceSceneIds)
  const scenes = source.scenes.filter((scene) =>
    sceneIds.has(scene.id) || scene.episode === chapter.sourceEpisode)
  const shots = source.shots
    .filter((shot) => shot.episode === chapter.sourceEpisode)
    .slice(0, 20)
  return [
    `书名：${source.title}`,
    source.idea && `最初想法：${source.idea}`,
    briefPromptBlock(source.brief),
    "## 核心人物",
    ...compact(source.characters, 12, (character) =>
      `- ${character.name}｜${character.identity}｜性格：${character.personality}｜动机：${character.motivation}｜弧光：${character.arc}`),
    "## 本集剧情",
    ...nearbyEpisodes.map((item) =>
      `- 第 ${item.number} 集《${item.title}》：${item.synopsis}｜钩子：${item.hook}`),
    episode ? `当前来源集：第 ${episode.number} 集《${episode.title}》` : "",
    "## 本章场次",
    ...compact(scenes, 8, (scene) =>
      `- ${scene.location}｜${scene.timeOfDay}｜${scene.summary}｜人物：${scene.characters.join("、")}`),
    "## 可复用动作与对白",
    ...compact(shots, 20, (shot) =>
      `- ${shot.action}${shot.dialogue ? `｜${shot.speaker || "角色"}：${shot.dialogue}` : ""}`),
    "## Canon",
    ...compact(source.canonFacts, 80, (fact) =>
      `- ${fact.entityName}｜${fact.field}=${fact.value}｜第 ${fact.validFromEpisode}-${fact.validToEpisode} 集`),
    "## 项目原文摘录",
    ...compact(source.materialExcerpts, 3, (text) => `- ${text.slice(0, 1_800)}`),
  ].filter(Boolean).join("\n")
}

export function buildNovelChapterPrompt(context: NovelGenerationContext): {
  system: string
  user: string
  promptVersion: string
} {
  const { chapter, previousChapters, sourcePack } = context
  return {
    system: SYSTEM,
    promptVersion: NOVEL_PROMPT_VERSION,
    user: `${sourceBlock(sourcePack, chapter)}

## 前文摘要
${previousChapters.length > 0
  ? previousChapters.map((item) => `第 ${item.number} 章《${item.title}》：${item.summary}`).join("\n")
  : "这是第一章。"}

## 本章任务
- 章号：第 ${chapter.number} 章
- 标题：${chapter.title}
- 目标字数：约 ${chapter.targetWords} 字
- 章纲：${chapter.outline}
- 必须兑现的章末钩子：${chapter.hook}

请直接生成这一章。`,
  }
}

export function normalizeNovelGeneration(
  raw: unknown,
  chapter: NovelChapterRecord,
): NovelGenerationResult {
  const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const content = typeof row.content === "string" ? row.content.trim() : ""
  if (!content) throw new Error("模型没有返回小说正文，请重新生成")
  return {
    title: typeof row.title === "string" && row.title.trim()
      ? row.title.trim().slice(0, 120)
      : chapter.title,
    content,
    summary: typeof row.summary === "string" ? row.summary.trim().slice(0, 500) : "",
  }
}
