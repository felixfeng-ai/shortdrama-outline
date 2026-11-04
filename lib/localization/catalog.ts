export const MARKET_CODES = ["en-US", "es-419", "id-ID"] as const
export type MarketCode = (typeof MARKET_CODES)[number]

export interface MarketProfile {
  code: MarketCode
  market: string
  locale: string
  language: string
  label: string
  platforms: string[]
  defaultRating: string
  subtitle: {
    maxLineChars: number
    maxCps: number
    minDurationMs: number
    maxDurationMs: number
  }
  dubbing: {
    wordsPerMinute: number
  }
  visualRules: string[]
}

export const MARKET_PROFILES: MarketProfile[] = [
  {
    code: "en-US",
    market: "US",
    locale: "en-US",
    language: "English",
    label: "北美英语",
    platforms: ["TikTok", "ReelShort", "DramaBox"],
    defaultRating: "PG-13",
    subtitle: { maxLineChars: 42, maxCps: 17, minDurationMs: 1_000, maxDurationMs: 7_000 },
    dubbing: { wordsPerMinute: 150 },
    visualRules: ["避免生成可读英文招牌", "货币使用 USD", "手机 UI 与街道标识需本地化"],
  },
  {
    code: "es-419",
    market: "LATAM",
    locale: "es-419",
    language: "Spanish",
    label: "拉美西语",
    platforms: ["TikTok", "DramaBox", "GoodShort"],
    defaultRating: "14+",
    subtitle: { maxLineChars: 38, maxCps: 16, minDurationMs: 1_000, maxDurationMs: 7_000 },
    dubbing: { wordsPerMinute: 155 },
    visualRules: ["避免生成可读西语文字", "货币与地点需按目标国家确认", "字幕避免长句"],
  },
  {
    code: "id-ID",
    market: "SEA-ID",
    locale: "id-ID",
    language: "Indonesian",
    label: "印度尼西亚语",
    platforms: ["TikTok", "DramaBox", "ShortMax"],
    defaultRating: "13+",
    subtitle: { maxLineChars: 36, maxCps: 15, minDurationMs: 1_100, maxDurationMs: 7_000 },
    dubbing: { wordsPerMinute: 145 },
    visualRules: ["避免生成可读印尼语文字", "货币使用 IDR", "宗教与家庭关系需单独审校"],
  },
]

export function getMarketProfile(code: unknown): MarketProfile | null {
  return MARKET_PROFILES.find((profile) => profile.code === code) ?? null
}
