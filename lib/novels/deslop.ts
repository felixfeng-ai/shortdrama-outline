import type { NovelChapterRecord } from "./types.ts"
import type { NovelLintReport } from "./lint.ts"

export const DESLOP_PROMPT_VERSION = "novel-deslop-v1"

export function buildDeslopPrompt(
  chapter: NovelChapterRecord,
  report: NovelLintReport,
): { system: string; user: string; promptVersion: string } {
  return {
    promptVersion: DESLOP_PROMPT_VERSION,
    system: `你是中文小说改稿编辑。只处理给定的章节，不新增事实、人物、事件、伏笔或回忆，不改变人物选择、因果和 Canon。

要求：
1. 保留所有情节事实、数字、专有名词、对话含义和叙事顺序。
2. 清理机械句式、重复表达、模板腔和制作流程词。
3. 用具体动作、感官和上下文替代抽象总结；不要为了“像人写”塞入口头禅或错别字。
4. 不承诺通过任何 AI 检测器。
5. 输出严格 JSON：{"content":"完整修订正文","notes":["改动说明"]}。`,
    user: `章节：第 ${chapter.number} 章《${chapter.title}》
目标字数：约 ${chapter.targetWords} 字
章末钩子：${chapter.hook}

待处理问题：
${report.issues.map((issue) => `- [${issue.severity}] ${issue.message}`).join("\n") || "- 无确定性问题，只做轻度口语化与节奏整理"}

原文：
${chapter.content}`,
  }
}

export function normalizeDeslopResult(raw: unknown): {
  content: string
  notes: string[]
} {
  const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const content = typeof row.content === "string" ? row.content.trim() : ""
  if (!content) throw new Error("模型没有返回修订正文")
  return {
    content,
    notes: Array.isArray(row.notes)
      ? row.notes.filter((item): item is string => typeof item === "string").slice(0, 12)
      : [],
  }
}
