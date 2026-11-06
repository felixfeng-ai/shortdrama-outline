import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

import { openDb } from "../lib/assets/db.ts"
import { createProject, createSnapshot } from "../lib/assets/repo.ts"
import { saveProjectContext } from "../lib/assets/project-context.ts"
import { createCanonFact } from "../lib/assets/canon.ts"
import { saveProjectMaterial } from "../lib/assets/materials.ts"
import type { Act, Character, Episode } from "../lib/types.ts"
import type { Scene, Shot, VisualCharacter, VisualPlace } from "../lib/assets/types.ts"

const owner = `anon_${"n".repeat(48)}`

test("NOVEL1 篇幅默认未选择，标准长篇预算范围稳定", async () => {
  const {
    NOVEL_PRESETS,
    readNovelPreset,
    estimateNovelGeneration,
  } = await import("../lib/novels/presets.ts")

  assert.equal(readNovelPreset(null), null)
  assert.equal(readNovelPreset("unknown"), null)
  assert.equal(NOVEL_PRESETS.length, 3)

  const standard = readNovelPreset("standard")
  assert.ok(standard)
  assert.equal(standard.targetChapters, 90)
  assert.equal(standard.wordsMin, 200_000)
  assert.equal(standard.wordsMax, 250_000)

  const estimate = estimateNovelGeneration(standard, 30)
  assert.equal(estimate.chapters, 90)
  assert.equal(estimate.wordsMin, 200_000)
  assert.equal(estimate.wordsMax, 250_000)
  assert.ok(estimate.outputTokensMin > 200_000)
  assert.ok(estimate.quotaUnits > 0)
  assert.match(estimate.durationLabel, /小时|分钟/)
})

function seedSourceProject(db: ReturnType<typeof openDb>) {
  const project = createProject(db, "雨夜旧报社", owner)
  saveProjectContext(db, project.id, owner, {
    brief: {
      premise: "记者想查清父亲失踪真相，却被报社权力网络阻止",
      payoff: "每次接近真相都发现父亲也参与了隐瞒",
      destination: "从追求清白走到接受复杂真相",
      emotion: "克制、压抑",
      audience: "25-35 女性",
      references: "漫长的季节",
      redline: "不要爽剧化",
    },
    look: { palette: "冷蓝、低饱和", light: "雨天窗光", lens: "长焦", banned: "霓虹" },
    episodeCount: 30,
  })

  const characters: Character[] = [{
    id: "char-linyuan",
    name: "林远",
    identity: "调查记者",
    personality: "克制、执拗",
    motivation: "查清父亲失踪真相",
    arc: "从相信真相只有一种走到接受复杂真相",
  }]
  const acts: Act[] = [
    { id: "act-1", key: "setup", title: "旧案重启", summary: "林远收到匿名档案", beats: ["匿名信", "回到旧报社"] },
    { id: "act-2", key: "conflict", title: "权力封锁", summary: "调查被层层阻止", beats: ["档案缺页", "父亲旧同事失踪"] },
    { id: "act-3", key: "resolution", title: "真相代价", summary: "林远公开证据并承担后果", beats: ["公开录音", "接受父亲并不清白"] },
  ]
  const episodes: Episode[] = Array.from({ length: 30 }, (_, index) => ({
    id: `ep-${index + 1}`,
    number: index + 1,
    title: index === 0 ? "匿名档案" : `雨夜来信 ${index + 1}`,
    synopsis: `第 ${index + 1} 集，林远追查一条新线索，并发现父亲旧同事隐瞒了关键事实。`,
    hook: `第 ${index + 1} 集结尾，新证据指向林远最信任的人。`,
  }))
  const visuals: VisualCharacter[] = [{
    id: "visual-linyuan",
    entityId: "char-linyuan",
    name: "林远",
    age: "32岁",
    face: "偏长脸",
    hair: "黑色短发",
    marks: "左眉浅疤",
    wardrobe: "沙色短夹克",
    props: "旧记者证",
    anchor: "32-year-old Chinese journalist",
  }]
  const places: VisualPlace[] = [{
    id: "place-office",
    name: "旧报社",
    space: "老式办公楼",
    props: "封存档案柜",
    lighting: "雨天冷光",
    grade: "青灰",
    anchor: "old newspaper office",
  }]
  const scenes: Scene[] = episodes.map((episode, index) => ({
    id: `scene-${index + 1}`,
    number: index + 1,
    episode: episode.number,
    location: "旧报社",
    timeOfDay: "夜",
    summary: `林远在旧报社核对第 ${episode.number} 条线索。`,
    characters: ["林远"],
  }))
  const shots: Shot[] = scenes.map((scene, index) => ({
    id: `shot-${index + 1}`,
    entityId: `shot-entity-${index + 1}`,
    shot: index + 1,
    episode: scene.episode,
    scene: scene.summary,
    characters: ["林远"],
    action: "林远翻开封存档案，发现父亲签名。",
    speaker: "林远",
    dialogue: "这不可能。",
    place: "旧报社",
    shotSize: "中景",
    camera: "固定",
    prompt: "THIS_SHOULD_NOT_LEAK, 35mm, teal grade",
    refImages: ["林远·定妆.png"],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: false },
    status: "todo",
  }))

  for (const [kind, payload] of [
    ["characters", characters],
    ["acts", acts],
    ["episodes", episodes],
    ["visualCharacters", visuals],
    ["visualPlaces", places],
    ["scenes", scenes],
    ["shots", shots],
  ] as const) {
    createSnapshot(db, { projectId: project.id, kind, payload })
  }
  createCanonFact(db, project.id, {
    kind: "character",
    name: "林远",
    field: "leftEyebrowScar",
    value: "有",
    validFromEpisode: 1,
    validToEpisode: 30,
    locked: true,
  })
  saveProjectMaterial(db, {
    projectId: project.id,
    ownerId: owner,
    name: "原著设定.txt",
    kind: "notes",
    content: "父亲失踪前最后出现的地点是旧报社地下档案室。",
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "idea",
    payload: { title: "雨夜旧报社", text: "调查记者收到父亲失踪案的匿名档案。" },
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualCharacters",
    payload: visuals,
  })
  createSnapshot(db, {
    projectId: project.id,
    kind: "visualPlaces",
    payload: places,
  })
  return project
}

test("NOVEL2 来源包复用叙事事实，排除镜头提示词和制作参数", async () => {
  const { buildNovelSourcePack } = await import("../lib/novels/source-pack.ts")
  const db = openDb(":memory:")
  try {
    const project = seedSourceProject(db)
    const pack = buildNovelSourcePack(db, project.id)
    assert.equal(pack.episodes.length, 30)
    assert.equal(pack.characters[0].name, "林远")
    assert.equal(pack.scenes.length, 30)
    assert.equal(pack.shots[0].action.length > 0, true)
    assert.equal(pack.shots[0].dialogue, "这不可能。")
    assert.ok(pack.canonFacts.length >= 1)
    assert.ok(pack.materialExcerpts[0].includes("地下档案室"))
    assert.ok(pack.signature.length >= 32)
    assert.equal(JSON.stringify(pack).includes("THIS_SHOULD_NOT_LEAK"), false)
    assert.equal(JSON.stringify(pack).includes("林远·定妆.png"), false)
    assert.ok(pack.sourceSnapshotIds.length >= 7)
  } finally {
    db.close()
  }
})

test("NOVEL3 标准长篇规划 90 章、6 卷，每章可回指短剧集数", async () => {
  const { planNovel } = await import("../lib/novels/planner.ts")
  const { readNovelPreset } = await import("../lib/novels/presets.ts")
  const preset = readNovelPreset("standard")
  assert.ok(preset)
  const source = {
    title: "雨夜旧报社",
    episodes: Array.from({ length: 30 }, (_, index) => ({
      number: index + 1,
      title: `第 ${index + 1} 集`,
      synopsis: `林远追查第 ${index + 1} 条线索。`,
      hook: `第 ${index + 1} 集钩子。`,
    })),
    scenes: Array.from({ length: 30 }, (_, index) => ({
      id: `scene-${index + 1}`,
      episode: index + 1,
      summary: `第 ${index + 1} 场：旧报社对峙。`,
      location: "旧报社",
    })),
  }
  const plan = planNovel(source, preset)
  assert.equal(plan.chapters.length, 90)
  assert.equal(plan.volumes.length, 6)
  assert.equal(plan.chapters[0].sourceEpisode, 1)
  assert.equal(plan.chapters[89].sourceEpisode, 30)
  assert.equal(plan.chapters.every((chapter) => chapter.targetWords >= 2_200), true)
  assert.equal(plan.chapters.every((chapter) => chapter.hook.length > 0), true)
})

test("NOVEL4 小说、章纲和 append-only 版本可持久化，上游变化只标记过期", async () => {
  const {
    createNovelEdition,
    saveNovelPlan,
    saveNovelChapter,
    updateNovelChapter,
    getNovelEdition,
    listNovelChapters,
    markNovelChaptersStale,
  } = await import("../lib/novels/repo.ts")
  const db = openDb(":memory:")
  try {
    const project = seedSourceProject(db)
    const edition = createNovelEdition(db, {
      projectId: project.id,
      ownerId: owner,
      title: "雨夜旧报社",
      preset: "standard",
      sourceSnapshotIds: ["s1"],
      sourceSignature: "sig-v1",
    })
    saveNovelPlan(db, edition.id, {
      volumes: [{ title: "第一卷 匿名档案", startChapter: 1, endChapter: 15, summary: "开端" }],
      chapters: [{
        number: 1,
        title: "雨夜来信",
        outline: "林远收到匿名档案。",
        hook: "档案上出现父亲的签名。",
        targetWords: 2400,
        sourceEpisode: 1,
        sourceSceneIds: ["scene-1"],
      }],
    })
    saveNovelChapter(db, edition.id, {
      number: 1,
      content: "雨落在旧报社的玻璃上。林远拆开没有寄件人的档案袋。",
      summary: "林远收到匿名档案。",
      sourceSignature: "sig-v1",
    })
    updateNovelChapter(db, edition.id, 1, {
      content: "雨落在旧报社的玻璃上。林远拆开没有寄件人的档案袋，里面只有一页发黄的人事表。",
      summary: "林远收到匿名档案并发现人事表。",
      sourceSignature: "sig-v1",
      changeKind: "manual",
    })

    assert.equal(getNovelEdition(db, edition.id)?.plannedChapters, 1)
    assert.equal(listNovelChapters(db, edition.id)[0].revision, 2)
    const versions = db.prepare(
      "SELECT revision, change_kind FROM novel_chapter_versions WHERE chapter_id = ? ORDER BY revision",
    ).all(listNovelChapters(db, edition.id)[0].id) as Array<{ revision: number; change_kind: string }>
    assert.deepEqual(versions.map((row) => row.revision), [1, 2])
    assert.equal(versions[1].change_kind, "manual")

    markNovelChaptersStale(db, edition.id, "sig-v2")
    assert.equal(listNovelChapters(db, edition.id)[0].status, "stale")
    assert.equal(getNovelEdition(db, edition.id)?.sourceSignature, "sig-v2")
  } finally {
    db.close()
  }
})

test("NOVEL5 确定性质检识别工程词、机械句式和占位符", async () => {
  const { auditNovelChapter } = await import("../lib/novels/lint.ts")
  const report = auditNovelChapter({
    content: "分镜里，林远看着首帧。不是害怕，而是迟疑。不是退后，而是站住。TODO 待补。",
    targetWords: 2200,
    hook: "电话响了。",
  })
  assert.ok(report.issues.some((issue) => issue.code === "production-leak"))
  assert.ok(report.issues.some((issue) => issue.code === "mechanical-pattern"))
  assert.ok(report.issues.some((issue) => issue.code === "placeholder"))
  assert.ok(report.wordCount < 100)

  const clean = auditNovelChapter({
    content: "雨声压在窗沿上。林远没有动，只把那张人事表翻到背面。\n\n一行褪色的钢笔字，正好停在父亲名字下面。",
    targetWords: 50,
    hook: "钢笔字写着：今晚不要回档案室。",
  })
  assert.equal(clean.issues.some((issue) => issue.code === "production-leak"), false)
})

test("NOVEL6 图片视频任务存在时小说让路，批次只写已完成章节", async () => {
  const {
    hasActiveMediaWork,
    runNovelGenerationTick,
  } = await import("../lib/novels/generator.ts")
  const {
    createNovelEdition,
    saveNovelPlan,
    getNovelEdition,
    listNovelChapters,
    enqueueNovelRun,
  } = await import("../lib/novels/repo.ts")
  const db = openDb(":memory:")
  try {
    const project = seedSourceProject(db)
    db.prepare(
      `INSERT INTO generation_tasks
        (id, project_id, target_type, target_id, provider_id, model, prompt, prompt_hash,
         status, media_kind, created_at)
       VALUES (?, ?, 'shot', 's1', 'test', 'test', 'p', 'h', 'running', 'video', ?)`,
    ).run("task-running-video", project.id, Date.now())
    assert.equal(hasActiveMediaWork(db, project.id), true)

    const edition = createNovelEdition(db, {
      projectId: project.id,
      ownerId: owner,
      title: "雨夜旧报社",
      preset: "medium",
      sourceSnapshotIds: ["s1"],
      sourceSignature: "sig-v1",
    })
    saveNovelPlan(db, edition.id, {
      volumes: [{ title: "第一卷", startChapter: 1, endChapter: 2, summary: "开端" }],
      chapters: [1, 2].map((number) => ({
        number,
        title: `第 ${number} 章`,
        outline: `第 ${number} 章事件`,
        hook: `第 ${number} 章钩子`,
        targetWords: 2200,
        sourceEpisode: number,
        sourceSceneIds: [`scene-${number}`],
      })),
    })
    const run = enqueueNovelRun(db, edition.id, "idem-1", 2)

    let calls = 0
    const waiting = await runNovelGenerationTick(db, run.id, {
      generateChapter: async () => {
        calls += 1
        return { title: "x", content: "x", summary: "x" }
      },
      maxChapters: 1,
    })
    assert.equal(waiting.state, "waiting")
    assert.equal(calls, 0)

    db.prepare("UPDATE generation_tasks SET status = 'succeeded' WHERE id = ?").run("task-running-video")
    const progressed = await runNovelGenerationTick(db, run.id, {
      generateChapter: async ({ chapter }) => {
        calls += 1
        return {
          title: chapter.title,
          content: `雨落在旧报社的窗上。${chapter.outline}`,
          summary: chapter.outline,
        }
      },
      maxChapters: 1,
    })
    assert.equal(progressed.state, "queued")
    assert.equal(calls, 1)
    assert.equal(listNovelChapters(db, edition.id).filter((chapter) => chapter.status === "generated").length, 1)
    assert.equal(getNovelEdition(db, edition.id)?.completedChapters, 1)
  } finally {
    db.close()
  }
})

test("NOVEL7 Markdown/TXT/ZIP 导出包含卷章、来源与 AI 声明", async () => {
  const { buildNovelExport } = await import("../lib/novels/export.ts")
  const input = {
    title: "雨夜旧报社",
    presetLabel: "标准长篇版",
    status: "complete",
    model: "deepseek-chat",
    promptVersion: "novel-v1",
    sourceSnapshotIds: ["s1", "s2"],
    chapters: [1, 2, 3].map((number) => ({
      number,
      title: `第 ${number} 章`,
      content: `第 ${number} 章正文。`,
      wordCount: 8,
    })),
  }
  const markdown = buildNovelExport(input, "md")
  assert.equal(markdown.mime, "text/markdown; charset=utf-8")
  const text = new TextDecoder().decode(markdown.bytes)
  assert.match(text, /雨夜旧报社/)
  assert.match(text, /第 3 章正文/)
  assert.match(text, /AI 生成/)
  assert.match(text, /novel-v1/)

  const txt = buildNovelExport(input, "txt")
  assert.match(new TextDecoder().decode(txt.bytes), /第 2 章/)
  const docx = buildNovelExport(input, "docx")
  assert.equal(
    docx.mime,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  )
  assert.ok(docx.bytes.byteLength > 100)
  const epub = buildNovelExport(input, "epub")
  assert.equal(epub.mime, "application/epub+zip")
  assert.ok(epub.bytes.byteLength > 100)
  const zip = buildNovelExport(input, "zip")
  assert.equal(zip.mime, "application/zip")
  assert.ok(zip.bytes.byteLength > 100)
})

test("NOVEL8 导出菜单、独立页面、样式、API 客户端与技能目录完成接线", async () => {
  const projectBar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  const page = fs.readFileSync("app/novels/[projectId]/page.tsx", "utf8")
  const css = fs.readFileSync("app/novels/novel.css", "utf8")
  const client = fs.readFileSync("lib/novels/client.ts", "utf8")
  const skills = fs.readFileSync("lib/skills/catalog.ts", "utf8")

  assert.match(projectBar, /小说稿/)
  assert.match(projectBar, /\/novels\//)
  assert.match(page, /NOVEL WORKSPACE|小说工作台/)
  assert.match(css, /novel-workspace/)
  assert.match(client, /fetchNovelWorkspace/)
  assert.match(skills, /小说化/)
  assert.match(skills, /小说去 AI 味/)
})

test("NOVEL9 API 创建、规划、暂停和恢复保持 owner 隔离", async () => {
  const { GET, POST } = await import("../app/api/projects/[id]/novels/route.ts")
  const { POST: plan } = await import("../app/api/projects/[id]/novels/[novelId]/plan/route.ts")
  const { POST: pause } = await import("../app/api/projects/[id]/novels/[novelId]/pause/route.ts")
  const { POST: resume } = await import("../app/api/projects/[id]/novels/[novelId]/resume/route.ts")
  const { __resetDbForTests, getDbForRequest } = await import("../lib/assets/store.ts")

  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const project = seedSourceProject(db)
  const request = (path: string, body?: unknown) => new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      cookie: `chengju_sid=${owner}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const context = { params: { id: project.id } }

  const createdResponse = await POST(request(`/api/projects/${project.id}/novels`, {
    title: "雨夜旧报社",
    preset: "standard",
  }), context)
  assert.equal(createdResponse.status, 200)
  const created = (await createdResponse.json()).data.edition
  assert.equal(created.preset, "standard")

  const planResponse = await plan(request(`/api/projects/${project.id}/novels/${created.id}/plan`, {
    preset: "standard",
  }), { params: { id: project.id, novelId: created.id } })
  assert.equal(planResponse.status, 200)
  assert.equal((await planResponse.json()).data.chapters.length, 90)

  const pauseResponse = await pause(request(`/api/projects/${project.id}/novels/${created.id}/pause`, {}), {
    params: { id: project.id, novelId: created.id },
  })
  assert.equal(pauseResponse.status, 200)

  const resumeResponse = await resume(request(`/api/projects/${project.id}/novels/${created.id}/resume`, {}), {
    params: { id: project.id, novelId: created.id },
  })
  assert.equal(resumeResponse.status, 200)

  const listResponse = await GET(request(`/api/projects/${project.id}/novels`), context)
  assert.equal((await listResponse.json()).data.editions.length, 1)

  const otherOwner = new Request(`http://localhost/api/projects/${project.id}/novels`, {
    method: "POST",
    headers: {
      cookie: `chengju_sid=anon_${"x".repeat(48)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ preset: "standard" }),
  })
  const hidden = await POST(otherOwner, context)
  assert.equal(hidden.status, 403)
})

test("NOVEL10 完整备份恢复小说稿，交付包勾选入口已接线", async () => {
  const { POST: importPackage } = await import("../app/api/project-import/route.ts")
  const { buildProjectPackageManifest } = await import("../lib/export/package.ts")
  const { buildAiExportDisclosure } = await import("../lib/export/ai-disclosure.ts")
  const { listNovelChapters, listNovelEditions } = await import("../lib/novels/repo.ts")
  const { __resetDbForTests, getDbForRequest } = await import("../lib/assets/store.ts")

  __resetDbForTests(":memory:")
  const db = getDbForRequest()
  const manifest = buildProjectPackageManifest({
    project: { id: "old-project", title: "带回小说稿", createdAt: 1, updatedAt: 2 },
    mode: "backup",
    exportedAt: 3,
    projectSettings: {
      genre: "none",
      episodeCount: 6,
      brief: {
        premise: "",
        payoff: "",
        destination: "",
        emotion: "",
        audience: "",
        references: "",
        redline: "",
      },
      look: { palette: "", light: "", lens: "", banned: "" },
      judgments: [],
    },
    story: {
      idea: "一个记者追查旧案",
      characters: [],
      acts: [],
      episodes: [{ id: "ep-1", number: 1, title: "旧案", synopsis: "林远回到旧报社。", hook: "电话响了。" }],
    },
    assets: { visuals: [], scenes: [], places: [], shots: [] },
    refs: [],
    keyframes: [],
    tasks: [],
    snapshots: [],
    materials: [],
    ai: buildAiExportDisclosure(),
    novels: [{
      title: "旧报社",
      preset: "medium",
      status: "complete",
      volumes: [{ title: "第一卷", summary: "开端", startChapter: 1, endChapter: 1 }],
      chapters: [{
        number: 1,
        title: "雨夜来信",
        outline: "林远收到匿名档案。",
        hook: "档案上出现父亲的签名。",
        targetWords: 1800,
        sourceEpisode: 1,
        sourceSceneIds: [],
        content: "雨落在旧报社的窗上。林远拆开没有寄件人的档案袋。",
        summary: "林远收到匿名档案。",
      }],
    }],
  })
  const form = new FormData()
  form.set("manifest", JSON.stringify(manifest))
  const request = new Request("http://localhost/api/project-import", {
    method: "POST",
    headers: { cookie: `chengju_sid=${owner}` },
    body: form,
  })
  const response = await importPackage(request)
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.data.counts.novels, 1)
  const importedProjectId = payload.data.project.id
  const editions = listNovelEditions(db, importedProjectId, owner)
  assert.equal(editions.length, 1)
  assert.equal(editions[0].preset, "medium")
  assert.match(listNovelChapters(db, editions[0].id)[0].content, /旧报社/)

  const bar = fs.readFileSync("components/ProjectBar.tsx", "utf8")
  const page = fs.readFileSync("app/page.tsx", "utf8")
  assert.match(bar, /交付包包含小说稿/)
  assert.match(bar, /includeNovel/)
  assert.match(page, /buildNovelExport/)
  assert.match(page, /novels: novelBackup/)
})
