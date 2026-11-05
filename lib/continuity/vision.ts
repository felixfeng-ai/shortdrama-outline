import { parseJson } from '../deepseek.ts'

const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const DEFAULT_MODEL = 'qwen-vl-max'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const AREAS = new Set<ContinuityArea>(['character', 'place', 'prop', 'lighting', 'composition'])
const SEVERITIES = new Set<ContinuitySeverity>(['error', 'warning', 'info'])

export type ContinuityArea = 'character' | 'place' | 'prop' | 'lighting' | 'composition'
export type ContinuitySeverity = 'error' | 'warning' | 'info'

export interface ContinuityContext {
  projectTitle: string
  shotLabel: string
  shotPrompt: string
  characters: Array<{
    name: string
    wardrobe: string
    marks: string
    anchor: string
  }>
  places: Array<{
    name: string
    space: string
    props: string
    lighting: string
    anchor: string
  }>
  canon: string[]
}

export interface ContinuityIssue {
  area: ContinuityArea
  severity: ContinuitySeverity
  expected: string
  observed: string
  evidence: string
  suggestion: string
  promptPatch: string
}

export interface ContinuityReport {
  summary: string
  issues: ContinuityIssue[]
}

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

export function buildContinuityPrompt(context: ContinuityContext): string {
  const characters = context.characters.map((item) =>
    `${item.name}｜服装：${item.wardrobe || '未填写'}｜辨识特征：${item.marks || '未填写'}｜锚点：${item.anchor || '未填写'}`
  )
  const places = context.places.map((item) =>
    `${item.name}｜空间：${item.space || '未填写'}｜道具：${item.props || '未填写'}｜光线：${item.lighting || '未填写'}｜锚点：${item.anchor || '未填写'}`
  )
  return `你是短剧现场连续性场记。请把现场照片与当前项目事实逐项比较，不要因为照片好看就忽略偏差。

项目：${context.projectTitle}
当前镜头：${context.shotLabel}
镜头提示词：${context.shotPrompt || '未填写'}

人物 Canon：
${characters.join('\n') || '无'}

地点 Canon：
${places.join('\n') || '无'}

项目 Canon：
${context.canon.join('\n') || '无'}

只检查人物造型、地点结构、道具、光线和构图。每个确认的偏差必须给出期望、照片观察、证据、中文修正建议和可直接追加到提示词的英文片段（提示词修正）。
没有偏差时 issues 返回空数组，不要硬编问题。
只输出 JSON：
{
  "summary": "一句话总结现场与 Canon 的匹配情况",
  "issues": [
    {
      "area": "character|place|prop|lighting|composition",
      "severity": "error|warning|info",
      "expected": "项目期望",
      "observed": "照片观察",
      "evidence": "照片中的具体位置或细节",
      "suggestion": "中文修正建议",
      "promptPatch": "short English prompt patch"
    }
  ]
}`
}

export function parseContinuityReport(value: unknown): ContinuityReport {
  const root = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
  const summary = text(root.summary, 500)
  if (!summary) throw new Error('视觉检查没有返回检查摘要')
  const issues = Array.isArray(root.issues)
    ? root.issues.map((item): ContinuityIssue | null => {
        const issue = item && typeof item === 'object'
          ? item as Record<string, unknown>
          : {}
        const area = text(issue.area, 40) as ContinuityArea
        const severity = text(issue.severity, 20) as ContinuitySeverity
        if (!AREAS.has(area) || !SEVERITIES.has(severity)) return null
        const observed = text(issue.observed, 500)
        const suggestion = text(issue.suggestion, 500)
        if (!observed || !suggestion) return null
        return {
          area,
          severity,
          expected: text(issue.expected, 500),
          observed,
          evidence: text(issue.evidence, 500),
          suggestion,
          promptPatch: text(issue.promptPatch, 300),
        }
      }).filter((item): item is ContinuityIssue => item !== null)
    : []
  return { summary, issues: issues.slice(0, 12) }
}

export async function compareContinuityPhoto(
  input: {
    imageBase64: string
    mime: string
    context: ContinuityContext
  },
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
): Promise<ContinuityReport> {
  const imageBase64 = input.imageBase64.trim()
  if (!imageBase64 || !/^[A-Za-z0-9+/=\r\n]+$/.test(imageBase64)) {
    throw new Error('现场照片内容无效')
  }
  const bytes = Buffer.from(imageBase64, 'base64')
  if (bytes.length === 0) throw new Error('现场照片内容为空')
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error('现场照片不能超过 8MB')
  if (!IMAGE_MIMES.has(input.mime)) throw new Error('现场照片格式不支持')

  const apiKey = (env.DASHSCOPE_API_KEY || env.ALIYUN_DASHSCOPE_API_KEY || '').trim()
  if (!apiKey) throw new Error('视觉模型尚未配置 DASHSCOPE_API_KEY')
  const baseUrl = (env.ALIYUN_VISION_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
  const model = env.ALIYUN_VISION_MODEL?.trim() || DEFAULT_MODEL
  const response = await fetchImpl(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: '你是严谨的短剧现场连续性场记，只输出合法 JSON。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: buildContinuityPrompt(input.context) },
            {
              type: 'image_url',
              image_url: { url: `data:${input.mime};base64,${imageBase64}` },
            },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1600,
    }),
  })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('视觉模型密钥无效，请联系管理员')
    }
    if (response.status === 429) throw new Error('现场检查请求过于频繁，请稍后再试')
    throw new Error('现场连续性检查暂时不可用，请稍后重试')
  }
  const payload = await response.json().catch(() => null) as {
    choices?: Array<{ message?: { content?: unknown } }>
  } | null
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('视觉模型没有返回检查结果')
  }
  return parseContinuityReport(parseJson<unknown>(content))
}
