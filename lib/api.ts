// 前后端统一的响应信封与前端调用封装。
// 所有 API Route 都返回 { success, data, error }，前端只认这一种形状。

export interface ApiResponse<T> {
  success: boolean
  data: T | null
  error: string | null
}

/** 服务端：成功响应 */
export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null }
}

/** 服务端：失败响应 */
export function fail(error: string): ApiResponse<never> {
  return { success: false, data: null, error }
}

/**
 * 客户端：POST 一个 JSON 请求。
 * 失败时抛出带中文 message 的 Error，界面直接展示即可。
 */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('网络连接失败，请检查网络后重试')
  }

  let payload: ApiResponse<T>
  try {
    payload = (await res.json()) as ApiResponse<T>
  } catch {
    throw new Error('服务返回了无法识别的内容，请重试')
  }

  if (!res.ok || !payload.success || payload.data === null) {
    throw new Error(payload?.error || '生成失败，请重试')
  }
  return payload.data
}

/** SSE 事件回调：event 是事件名，data 是服务端那一帧的 JSON 载荷 */
export type SseHandler = (event: string, data: unknown) => void

/**
 * 客户端：POST 一个 SSE 请求，逐帧回调直到服务端关闭连接。
 *
 * 两段式错误处理，因为服务端有两种失败时机：
 * - 建立流之前就失败（入参校验不过）→ 返回的是普通 JSON 信封，这里直接抛
 * - 流已经开始后失败（模型超时、JSON 解析不了）→ 服务端补推一个 error 事件，
 *   这里收到就抛，调用方按和 postJson 一样的方式 catch 即可
 */
export async function postSse(url: string, body: unknown, onEvent: SseHandler): Promise<void> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('网络连接失败，请检查网络后重试')
  }

  if (!res.ok || !res.body) {
    const payload = (await res.json().catch(() => null)) as ApiResponse<unknown> | null
    throw new Error(payload?.error || '生成失败，请重试')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // 一帧以空行结束，剩下的留在 buffer 里等下一块
      let split: number
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)

        let event = 'message'
        const dataLines: string[] = []
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
        }
        if (dataLines.length === 0) continue

        let data: unknown
        try {
          data = JSON.parse(dataLines.join('\n'))
        } catch {
          throw new Error('服务返回了无法识别的内容，请重试')
        }

        if (event === 'error') {
          const message = (data as { error?: string })?.error
          throw new Error(message || '生成失败，请重试')
        }
        onEvent(event, data)
      }
    }
  } finally {
    // 提前 return / 抛错时释放底层连接，别让流挂着
    reader.cancel().catch(() => {})
  }
}

/** 服务端：把任意异常翻译成 { body, status }，路由只需包一层 NextResponse */
export function errorResponse(error: unknown): { body: ApiResponse<never>; status: number } {
  // 输入校验失败
  if (error instanceof InputError) {
    return { body: fail(error.message), status: 400 }
  }
  // DeepSeek 相关错误（Key 无效 / 超时 / 解析失败等），message 已经是可以直接展示的中文
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') {
    return { body: fail(error.message), status: error.status }
  }
  // 剩下的是没预料到的问题：日志留详情，用户只看到一句话
  console.error('[api] 未处理的异常', error)
  return { body: fail('生成失败，请稍后重试'), status: 500 }
}

/** 请求参数不合法。路由里校验失败时抛这个 */
export class InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputError'
  }
}
