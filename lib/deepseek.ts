// DeepSeek 调用封装。统一走 OpenAI 兼容协议，与项目内其他服务保持一致的配置口径：
// BASE_URL = https://api.deepseek.com/v1，MODEL = deepseek-chat，KEY = DEEPSEEK_API_KEY
//
// 设计要点：
// 1. Key 只存在于服务端（API Route），前端永远拿不到
// 2. 模型偶尔会在 JSON 外面包 ```json 围栏或加解释文字，parseJson 负责兜底
// 3. 一次性返回（不做流式），带超时与有限重试

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-chat'

/** 单次请求超时时间。分集那一步输出较长，给足 120 秒 */
const TIMEOUT_MS = 120_000
/** 解析失败时的重试次数（模型偶发输出不合法 JSON） */
const MAX_ATTEMPTS = 2

/** 调用方（API Route）可以识别的错误，message 是给终端用户看的中文 */
export class AiError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'AiError'
    this.status = status
  }
}

function getConfig() {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    throw new AiError('未配置 DEEPSEEK_API_KEY，请在 .env.local 中填写后重启服务', 500)
  }
  return {
    apiKey,
    baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
  }
}

/**
 * 从模型输出里抠出 JSON。
 * 依次尝试：直接解析 → 去掉 ``` 围栏 → 截取第一个 { 到最后一个 } / 第一个 [ 到最后一个 ]。
 */
export function parseJson<T>(raw: string): T {
  const text = raw.trim()
  const candidates: string[] = [text]

  // 去掉 markdown 代码围栏
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  // 截取最外层的对象或数组
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ]) {
    const start = text.indexOf(open)
    const end = text.lastIndexOf(close)
    if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1))
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T
    } catch {
      // 换下一个候选继续试
    }
  }

  throw new AiError('AI 返回的内容不是合法 JSON，请重新生成一次', 502)
}

interface ChatOptions {
  /** 输出随机性。创意类任务用高一点，默认 0.9 */
  temperature?: number
  /** 限制输出长度，防止跑偏 */
  maxTokens?: number
}

/** 调一次 DeepSeek，拿到纯文本回复 */
async function chat(system: string, user: string, options: ChatOptions = {}): Promise<string> {
  const { apiKey, baseUrl, model } = getConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: options.temperature ?? 0.9,
        max_tokens: options.maxTokens ?? 4000,
        // 让模型尽量只吐 JSON，减少解析失败
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      // 把上游错误翻译成用户看得懂的话，不暴露内部细节
      if (res.status === 401) throw new AiError('DeepSeek API Key 无效，请检查配置', 401)
      if (res.status === 429) throw new AiError('请求过于频繁，请稍后再试', 429)
      if (res.status >= 500) throw new AiError('AI 服务暂时不可用，请稍后重试', 502)
      console.error('[deepseek] 上游返回异常', res.status, detail.slice(0, 500))
      throw new AiError('AI 调用失败，请稍后重试', 502)
    }

    const data = await res.json()
    const content: string | undefined = data?.choices?.[0]?.message?.content
    if (!content) throw new AiError('AI 没有返回内容，请重新生成', 502)
    return content
  } catch (error) {
    if (error instanceof AiError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiError('AI 生成超时，请重试或缩短输入', 504)
    }
    console.error('[deepseek] 请求失败', error)
    throw new AiError('网络异常，无法连接 AI 服务', 502)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 调 DeepSeek 并解析成结构化对象。
 * 解析失败会自动重试（模型重新生成一次通常就正常了）。
 */
export async function chatJson<T>(system: string, user: string, options: ChatOptions = {}): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const raw = await chat(system, user, options)
      return parseJson<T>(raw)
    } catch (error) {
      // Key 错、超时这类问题重试没意义，直接抛出
      if (error instanceof AiError && error.status !== 502) throw error
      lastError = error
      console.warn(`[deepseek] 第 ${attempt + 1} 次尝试失败，准备重试`, error)
    }
  }

  throw lastError instanceof AiError ? lastError : new AiError('AI 生成失败，请重试', 502)
}
