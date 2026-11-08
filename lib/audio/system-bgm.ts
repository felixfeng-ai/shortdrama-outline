import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

import type { BgmTrack } from "./bgm-types.ts"

interface SystemTrackSeed {
  id: string
  name: string
  file: string
  mood: string
  genre: string
  bpm: number
  tags: string[]
}

const seeds: SystemTrackSeed[] = [
  { id: "system-rain-mystery", name: "雨夜疑云", file: "rain-mystery.mp3", mood: "悬疑", genre: "氛围", bpm: 72, tags: ["悬疑", "雨夜", "调查", "冷色"] },
  { id: "system-iron-gate", name: "铁门之后", file: "iron-gate.mp3", mood: "悬疑", genre: "电影感", bpm: 78, tags: ["悬疑", "门口", "秘密", "低音"] },
  { id: "system-silent-deal", name: "无声交易", file: "silent-deal.mp3", mood: "紧张", genre: "电子", bpm: 92, tags: ["紧张", "交易", "对峙", "犯罪"] },
  { id: "system-countdown-pulse", name: "倒计时脉冲", file: "countdown-pulse.mp3", mood: "紧张", genre: "脉冲", bpm: 112, tags: ["紧张", "倒计时", "追逐", "反转"] },
  { id: "system-old-building-echo", name: "旧楼回声", file: "old-building-echo.mp3", mood: "神秘", genre: "环境", bpm: 68, tags: ["神秘", "旧楼", "回忆", "空间感"] },
  { id: "system-emotional-crack", name: "情绪裂缝", file: "emotional-crack.mp3", mood: "悲伤", genre: "弦乐氛围", bpm: 64, tags: ["悲伤", "离别", "冲突", "真相"] },
  { id: "system-warm-memory", name: "温暖回忆", file: "warm-memory.mp3", mood: "温情", genre: "钢琴氛围", bpm: 70, tags: ["温情", "回忆", "家庭", "柔和"] },
  { id: "system-home-light", name: "家门灯火", file: "home-light.mp3", mood: "温情", genre: "生活", bpm: 76, tags: ["温情", "家", "夜晚", "治愈"] },
  { id: "system-reunion", name: "久别重逢", file: "reunion.mp3", mood: "情感", genre: "抒情", bpm: 82, tags: ["重逢", "情感", "人物关系", "温暖"] },
  { id: "system-quiet-approach", name: "悄悄靠近", file: "quiet-approach.mp3", mood: "暧昧", genre: "轻氛围", bpm: 88, tags: ["甜宠", "暧昧", "靠近", "轻松"] },
  { id: "system-before-farewell", name: "告别之前", file: "before-farewell.mp3", mood: "悲伤", genre: "电影感", bpm: 60, tags: ["悲伤", "告别", "牺牲", "慢节奏"] },
  { id: "system-empty-room", name: "空房间", file: "empty-room.mp3", mood: "孤独", genre: "极简", bpm: 56, tags: ["孤独", "空镜", "回忆", "安静"] },
  { id: "system-reversal-moment", name: "反转时刻", file: "reversal-moment.mp3", mood: "反转", genre: "电影感", bpm: 104, tags: ["反转", "揭示", "真相", "冲击"] },
  { id: "system-against-wind", name: "逆风翻盘", file: "against-wind.mp3", mood: "爽感", genre: "鼓点", bpm: 118, tags: ["爽感", "逆袭", "胜利", "燃"] },
  { id: "system-evidence", name: "证据出现", file: "evidence.mp3", mood: "悬疑", genre: "律动", bpm: 96, tags: ["悬疑", "证据", "推理", "发现"] },
  { id: "system-city-drive", name: "都市疾行", file: "city-drive.mp3", mood: "行动", genre: "电子", bpm: 126, tags: ["都市", "行动", "追逐", "速度"] },
  { id: "system-light-comedy", name: "轻喜日常", file: "light-comedy.mp3", mood: "轻松", genre: "拨弦", bpm: 110, tags: ["喜剧", "轻松", "日常", "幽默"] },
  { id: "system-awkward-moment", name: "尴尬一刻", file: "awkward-moment.mp3", mood: "喜剧", genre: "轻巧", bpm: 116, tags: ["喜剧", "尴尬", "反差", "轻快"] },
  { id: "system-hope-rises", name: "希望升起", file: "hope-rises.mp3", mood: "希望", genre: "氛围", bpm: 90, tags: ["希望", "成长", "胜利", "明亮"] },
  { id: "system-ending-afterglow", name: "片尾余韵", file: "ending-afterglow.mp3", mood: "结尾", genre: "电影感", bpm: 74, tags: ["结尾", "余韵", "回忆", "收束"] },
]

const moodKeywords: Record<string, string[]> = {
  悬疑: ["悬疑", "秘密", "真相", "追踪", "调查", "证据", "门", "雨", "夜", "遗产", "交易"],
  紧张: ["紧张", "危险", "对峙", "冲突", "威胁", "追", "倒计时", "犯罪"],
  神秘: ["神秘", "奇怪", "未知", "旧楼", "档案", "陌生"],
  悲伤: ["悲伤", "哭", "死亡", "离开", "告别", "牺牲", "失去"],
  温情: ["温暖", "家庭", "母亲", "父亲", "孩子", "家", "照顾", "治愈"],
  情感: ["爱", "重逢", "拥抱", "想念", "关系", "告白"],
  暧昧: ["暧昧", "靠近", "心动", "甜", "恋爱"],
  孤独: ["孤独", "一个人", "空", "沉默", "回忆"],
  反转: ["反转", "原来", "竟然", "真相", "揭露", "证据"],
  爽感: ["逆袭", "翻盘", "成功", "胜利", "复仇", "燃"],
  行动: ["追", "跑", "打", "行动", "速度", "都市"],
  轻松: ["轻松", "日常", "搞笑", "幽默", "笑"],
  喜剧: ["喜剧", "尴尬", "误会", "搞笑", "反差"],
  希望: ["希望", "成长", "新生", "明亮", "未来"],
  结尾: ["结尾", "片尾", "余韵", "回望", "结束"],
}

function trackPath(file: string): string {
  return path.join(process.cwd(), "public", "audio", "bgm", "system", file)
}

function publicStorageKey(file: string): string {
  return `audio/bgm/system/${file}`
}

function waveform(id: string): number[] {
  let seed = [...id].reduce((value, char) => value + char.charCodeAt(0), 0)
  return Array.from({ length: 32 }, (_, index) => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const wave = 0.35 + (seed % 55) / 100
    return Number((wave * (0.76 + Math.sin((index + 1) * 0.72) * 0.24)).toFixed(2))
  })
}

export const SYSTEM_BGM_TRACKS: BgmTrack[] = seeds.map((seed, index) => {
  const filePath = trackPath(seed.file)
  const exists = fs.existsSync(filePath)
  const bytes = exists ? fs.statSync(filePath).size : 0
  return {
    id: seed.id,
    projectId: "system",
    name: seed.name,
    storageKey: publicStorageKey(seed.file),
    mime: "audio/mpeg",
    bytes,
    durationMs: 45_000,
    sha256: exists ? createHash("sha256").update(fs.readFileSync(filePath)).digest("hex") : "",
    licenseConfirmed: true,
    licenseNote: "VeyaTV 自制原创内测配乐；平台内嵌与用户成片发布可用。",
    createdAt: 1_788_000_000_000 + index,
    sourceType: "system",
    previewUrl: `/${publicStorageKey(seed.file)}`,
    bpm: seed.bpm,
    tags: seed.tags,
    mood: seed.mood,
    genre: seed.genre,
    licenseName: "VeyaTV Original License",
    licenseUrl: null,
    attribution: "VeyaTV",
    waveform: waveform(seed.id),
  }
})

export function isSystemBgmTrackId(id: string): boolean {
  return id.startsWith("system-")
}

export function getSystemBgmTrack(id: string): BgmTrack | null {
  return SYSTEM_BGM_TRACKS.find((track) => track.id === id) ?? null
}

export function systemBgmCategories(): string[] {
  return [...new Set(SYSTEM_BGM_TRACKS.map((track) => track.mood).filter(Boolean) as string[])]
}

export function recommendSystemBgmTracks(
  projectText: string,
  limit = 5,
): BgmTrack[] {
  const haystack = projectText.toLowerCase()
  return [...SYSTEM_BGM_TRACKS]
    .map((track) => {
      const moodHits = (moodKeywords[track.mood ?? ""] ?? [])
        .filter((keyword) => haystack.includes(keyword.toLowerCase())).length
      const tagHits = (track.tags ?? [])
        .filter((tag) => haystack.includes(tag.toLowerCase())).length
      return { track, score: moodHits * 3 + tagHits * 2 + (track.mood === "悬疑" ? 1 : 0) }
    })
    .sort((left, right) => right.score - left.score || (left.track.createdAt ?? 0) - (right.track.createdAt ?? 0))
    .slice(0, Math.max(1, Math.min(limit, SYSTEM_BGM_TRACKS.length)))
    .map((item) => item.track)
}
