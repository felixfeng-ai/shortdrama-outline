import type { DatabaseSync } from "node:sqlite"

import { chatJson } from "../deepseek.ts"
import {
  getNovelEdition,
  getNovelRun,
  listNovelChapters,
  saveNovelChapter,
  updateNovelRun,
} from "./repo.ts"
import { buildNovelSourcePack } from "./source-pack.ts"
import {
  buildNovelChapterPrompt,
  normalizeNovelGeneration,
} from "./prompts.ts"
import type {
  NovelChapterRecord,
  NovelGenerationContext,
  NovelGenerationResult,
  NovelRunRecord,
} from "./types.ts"

export function hasActiveMediaWork(db: DatabaseSync, projectId: string): boolean {
  const generation = db.prepare(
    `SELECT COUNT(*) AS n
     FROM generation_tasks
     WHERE project_id = ? AND status IN ('queued', 'running')`,
  ).get(projectId) as { n: number }
  const renders = db.prepare(
    `SELECT COUNT(*) AS n
     FROM video_renders
     WHERE project_id = ? AND status IN ('queued', 'running')`,
  ).get(projectId) as { n: number }
  return Number(generation.n) + Number(renders.n) > 0
}

export async function generateNovelChapterWithModel(
  context: NovelGenerationContext,
): Promise<NovelGenerationResult> {
  const prompt = buildNovelChapterPrompt(context)
  const raw = await chatJson<unknown>(prompt.system, prompt.user, {
    temperature: 0.72,
    maxTokens: Math.max(4_000, Math.min(9_000, context.chapter.targetWords * 2)),
  })
  return normalizeNovelGeneration(raw, context.chapter)
}

function nextChapter(chapters: NovelChapterRecord[], cursor: number): NovelChapterRecord | null {
  return chapters.find((chapter) =>
    chapter.number > cursor && !["generated", "edited"].includes(chapter.status)
  ) ?? null
}

function completedCount(chapters: NovelChapterRecord[]): number {
  return chapters.filter((chapter) => chapter.status === "generated" || chapter.status === "edited").length
}

function markChapterGenerating(db: DatabaseSync, chapterId: string, now: number): void {
  db.prepare(
    "UPDATE novel_chapters SET status = 'generating', updated_at = ? WHERE id = ?",
  ).run(now, chapterId)
}

function markChapterFailed(db: DatabaseSync, chapterId: string, now: number): void {
  db.prepare(
    "UPDATE novel_chapters SET status = 'failed', updated_at = ? WHERE id = ?",
  ).run(now, chapterId)
}

export interface NovelGenerationTickOptions {
  generateChapter?: (context: NovelGenerationContext) => Promise<NovelGenerationResult>
  maxChapters?: number
  checkMediaPriority?: boolean
}

/**
 * 一次 tick 只处理少量章节，并把游标落库。
 * 这样页面轮询或重新打开后都能续跑，也不会一次请求占满成片渲染的长连接。
 */
export async function runNovelGenerationTick(
  db: DatabaseSync,
  runId: string,
  options: NovelGenerationTickOptions = {},
): Promise<{ state: NovelRunRecord["status"]; run: NovelRunRecord }> {
  let run = getNovelRun(db, runId)
  if (!run) throw new Error("小说生成任务不存在")
  if (["paused", "complete", "failed"].includes(run.status)) {
    return { state: run.status, run }
  }
  const edition = getNovelEdition(db, run.novelId)
  if (!edition) throw new Error("小说稿不存在")

  if (options.checkMediaPriority !== false && hasActiveMediaWork(db, run.projectId)) {
    run = updateNovelRun(db, runId, { status: "waiting", error: null })
    return { state: "waiting", run }
  }

  run = updateNovelRun(db, runId, {
    status: "running",
    error: null,
    startedAt: run.startedAt ?? Date.now(),
  })
  const sourcePack = buildNovelSourcePack(db, edition.projectId)
  const maxChapters = Math.max(1, Math.min(5, Math.floor(options.maxChapters ?? 2)))
  const generator = options.generateChapter ?? generateNovelChapterWithModel
  let chapters = listNovelChapters(db, edition.id)
  let chapter = nextChapter(chapters, run.cursor)
  let processed = 0

  try {
    while (chapter && processed < maxChapters) {
      if (options.checkMediaPriority !== false && hasActiveMediaWork(db, edition.projectId)) {
        run = updateNovelRun(db, runId, {
          status: "waiting",
          cursor: chapter.number - 1,
          completed: completedCount(chapters),
        })
        return { state: "waiting", run }
      }
      markChapterGenerating(db, chapter.id, Date.now())
      const previousChapters = chapters
        .filter((item) => item.number < chapter!.number && item.summary)
        .slice(-2)
        .map((item) => ({ number: item.number, title: item.title, summary: item.summary }))
      const result = await generator({
        chapter,
        previousChapters,
        sourcePack,
      })
      saveNovelChapter(db, edition.id, {
        number: chapter.number,
        content: result.content,
        summary: result.summary || chapter.outline,
        sourceSignature: sourcePack.signature,
      })
      processed += 1
      chapters = listNovelChapters(db, edition.id)
      const completed = completedCount(chapters)
      run = updateNovelRun(db, runId, {
        status: "queued",
        cursor: chapter.number,
        completed,
        usedUnits: run.usedUnits + 1,
      })
      chapter = nextChapter(chapters, chapter.number)
    }

    if (!chapter) {
      run = updateNovelRun(db, runId, {
        status: "complete",
        cursor: edition.plannedChapters,
        completed: completedCount(chapters),
        finishedAt: Date.now(),
      })
      return { state: "complete", run }
    }
    return { state: run.status, run }
  } catch (error) {
    if (chapter) markChapterFailed(db, chapter.id, Date.now())
    run = updateNovelRun(db, runId, {
      status: "failed",
      error: error instanceof Error ? error.message : "小说生成失败",
      finishedAt: Date.now(),
    })
    return { state: "failed", run }
  }
}
