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
