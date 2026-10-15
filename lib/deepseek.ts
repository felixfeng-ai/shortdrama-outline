// DeepSeek 调用封装。统一走 OpenAI 兼容协议，与项目内其他服务保持一致的配置口径：
// BASE_URL = https://api.deepseek.com/v1，MODEL = deepseek-chat，KEY = DEEPSEEK_API_KEY
//
// 设计要点：
// 1. Key 只存在于服务端（API Route），前端永远拿不到
// 2. 模型偶尔会在 JSON 外面包 ```json 围栏或加解释文字，parseJson 负责兜底
// 3. 两种调用方式：chatJson 一次性返回（带超时与有限重试），
//    streamChat 流式产出增量（供第三步分集使用）

const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
const DEFAULT_MODEL = 'deepseek-chat'

/**
 * 单次请求超时时间。
 *
 * 分集与分镜输出都长：实测分镜 61 镜约 12k token / 57s，更大规模会到 100s 以上，
 * 所以给到 240 秒。nginx 的 proxy_read_timeout 必须大于这个值（见 deploy 里的说明）。
 */
const TIMEOUT_MS = 240_000
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
  /** 外部取消信号（客户端断开时由调用方传入），用于提前中止请求 */
  signal?: AbortSignal
}

/** 上游返回非 2xx 时，把状态码翻译成用户看得懂的中文，内部细节只进服务端日志 */
async function assertOk(res: Response): Promise<void> {
  if (res.ok) return
  const detail = await res.text().catch(() => '')
  if (res.status === 401) throw new AiError('DeepSeek API Key 无效，请检查配置', 401)
  if (res.status === 429) throw new AiError('请求过于频繁，请稍后再试', 429)
  if (res.status >= 500) throw new AiError('AI 服务暂时不可用，请稍后重试', 502)
  console.error('[deepseek] 上游返回异常', res.status, detail.slice(0, 500))
  throw new AiError('AI 调用失败，请稍后重试', 502)
}

/** 把请求/读取过程中抛出的异常翻译成可直接展示的中文 */
function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error
  if (error instanceof Error && error.name === 'AbortError') {
    return new AiError('AI 生成超时，请重试或缩短输入', 504)
  }
  console.error('[deepseek] 请求失败', error)
  return new AiError('网络异常，无法连接 AI 服务', 502)
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

    await assertOk(res)

    const data = await res.json()
    const content: string | undefined = data?.choices?.[0]?.message?.content
    if (!content) throw new AiError('AI 没有返回内容，请重新生成', 502)
    return content
  } catch (error) {
    throw toAiError(error)
  } finally {
    clearTimeout(timer)
  }
}

// ── 工具调用（function calling）─────────────────────────────────
//
// 给场记用（见 AGENT.md）。协议与 OpenAI 兼容：请求带 tools，响应里
// message.tool_calls 是模型想调的函数；我们把参数从 JSON 字符串解析成对象交给循环。
// 这里不做任何业务判断——工具该不该执行、结果怎么回填，都在 lib/agent/loop.ts。

export interface ToolChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

export interface ToolChatTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolChatResult {
  /** 模型决定直接回答时的文本 */
  reply?: string
  /** 模型要求调用的工具（可能多个） */
  toolCalls?: { id: string; name: string; args: Record<string, unknown> }[]
}

export async function chatWithTools(
  messages: ToolChatMessage[],
  tools: ToolChatTool[],
  options: ChatOptions = {},
): Promise<ToolChatResult> {
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
        messages,
        tools: tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        })),
        tool_choice: 'auto',
        temperature: options.temperature ?? 0.5,
        max_tokens: options.maxTokens ?? 1200,
      }),
      signal: controller.signal,
    })

    await assertOk(res)

    const data = await res.json()
    const message = data?.choices?.[0]?.message
    const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : []
    const toolCalls = rawCalls
      .map((call: { id?: unknown; function?: { name?: unknown; arguments?: unknown } }) => {
        const name = typeof call?.function?.name === 'string' ? call.function.name : ''
        if (!name) return null
        let args: Record<string, unknown> = {}
        const rawArgs = call?.function?.arguments
        if (typeof rawArgs === 'string' && rawArgs.trim()) {
          try {
            const parsed = JSON.parse(rawArgs)
            if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>
          } catch {
            // 参数不是合法 JSON：当成空参数继续，让工具自己去校验（工具会回中文说明）
          }
        }
        return { id: typeof call?.id === 'string' ? call.id : name, name, args }
      })
      .filter((c: unknown): c is { id: string; name: string; args: Record<string, unknown> } => !!c)

    const reply = typeof message?.content === 'string' ? message.content.trim() : ''
    if (toolCalls.length === 0 && !reply) {
      throw new AiError('AI 没有返回内容，请重新提问', 502)
    }
    return {
      reply: reply || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    }
  } catch (error) {
    throw toAiError(error)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 流式调一次 DeepSeek，逐个产出文本增量（delta）。
 *
 * 与 chat 的区别只在传输方式：请求体多一个 stream: true，响应体是 SSE 帧而不是
 * 一个完整 JSON。解析出 delta 就直接 yield 给调用方，由调用方决定怎么用。
 * response_format 仍然要 json_object——结构化输出的要求不变，变的只是「边生成边给」。
 */
export async function* streamChat(
  system: string,
  user: string,
  options: ChatOptions = {},
): AsyncGenerator<string> {
  const { apiKey, baseUrl, model } = getConfig()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  // 调用方（API Route）持有的 req.signal 在客户端断开时触发，转发给 fetch
  const abortFromOutside = () => controller.abort()
  options.signal?.addEventListener('abort', abortFromOutside)

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
        response_format: { type: 'json_object' },
        stream: true,
      }),
      signal: controller.signal,
    })

    await assertOk(res)
    if (!res.body) throw new AiError('AI 没有返回内容，请重新生成', 502)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE 一帧一行。按行取，剩下的留在 buffer 里等下一块数据补齐
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)

        // 只认 data 行；注释、event 行、心跳一律跳过
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') return

        try {
          const chunk = JSON.parse(payload)
          const delta: unknown = chunk?.choices?.[0]?.delta?.content
          if (typeof delta === 'string' && delta) yield delta
        } catch {
          // 单行解析失败不影响后面的内容，跳过即可
        }
      }
    }
  } catch (error) {
    throw toAiError(error)
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abortFromOutside)
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
