export const AI_GENERATION_LABEL = "AI 生成"
export const AI_PROVENANCE_PATH = "ai-provenance.json"
export const AI_EXPORT_NOTICE =
  "AI 生成内容声明：本项目包含由人工智能生成或辅助生成的内容。请保留此标识，并按发布平台与适用法规要求完成显式及隐式标识。"

export interface AiExportDisclosure {
  schema: "chengju.ai-disclosure"
  schemaVersion: 1
  label: typeof AI_GENERATION_LABEL
  notice: string
  provenancePath: typeof AI_PROVENANCE_PATH
  assetCount: number
  providers: string[]
}

/** 新导出统一使用这一份声明，避免 JSON、HTML、CSV 各自写一套文案。 */
export function buildAiExportDisclosure(input: {
  assetCount?: number
  providers?: string[]
} = {}): AiExportDisclosure {
  const providers = Array.from(new Set(
    (input.providers ?? [])
      .map((provider) => String(provider ?? "").trim())
      .filter(Boolean),
  )).slice(0, 20)
  return {
    schema: "chengju.ai-disclosure",
    schemaVersion: 1,
    label: AI_GENERATION_LABEL,
    notice: AI_EXPORT_NOTICE,
    provenancePath: AI_PROVENANCE_PATH,
    assetCount: Math.max(0, Math.floor(Number(input.assetCount) || 0)),
    providers,
  }
}
