import {
  ALIYUN_IMAGE_BASE_URL,
  buildAliyunImageEditRequest,
  buildAliyunImageRequest,
  getAliyunImageConfig,
  parseAliyunImageEditResult,
  parseAliyunTaskResult,
  parseAliyunTaskSubmission,
  sniffImageMime,
  type ImageAspect,
  type AliyunReferenceImage,
} from "./model.ts"

export interface RunImageGenerationInput {
  prompt: unknown
  aspect: unknown
  seed?: unknown
  referenceImages?: AliyunReferenceImage[]
  signal?: AbortSignal
}

export interface GeneratedImageBytes {
  bytes: Uint8Array
  mime: string
}

type Sleep = (ms: number) => Promise<void>

const wait: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function timeoutSignal(ms: number, external?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return external ? AbortSignal.any([external, timeout]) : timeout
}

function abortError(): Error {
  return new DOMException("Aborted", "AbortError")
}

function messageFromPayload(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const body = payload as Record<string, unknown>
    if (typeof body.message === "string") return body.message
    if (typeof body.code === "string") return body.code
    const output = body.output
    if (output && typeof output === "object") {
      const message = (output as Record<string, unknown>).message
      if (typeof message === "string") return message
    }
  }
  return "通义万相请求失败"
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return { message: await res.text().catch(() => "") }
  }
}

export async function runImageGeneration(
  input: RunImageGenerationInput,
  fetchImpl: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
  sleep: Sleep = wait,
): Promise<GeneratedImageBytes> {
  const config = getAliyunImageConfig(env)
  const prompt = typeof input.prompt === "string" ? input.prompt : ""
  const referenceImages = input.referenceImages ?? []
  const usesReferenceImages = referenceImages.length > 0
  const request = usesReferenceImages
    ? buildAliyunImageEditRequest({
      prompt,
      model: config.editModel,
      aspect: input.aspect as ImageAspect,
      images: referenceImages,
    })
    : buildAliyunImageRequest({
      prompt,
      model: config.model,
      aspect: input.aspect as ImageAspect,
      seed: typeof input.seed === "number" ? input.seed : undefined,
    })

  let submit: Response
  try {
    submit = await fetchImpl(request.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        ...(usesReferenceImages ? {} : { "X-DashScope-Async": "enable" }),
      },
      body: JSON.stringify(request.body),
      signal: timeoutSignal(usesReferenceImages ? 180_000 : 90_000, input.signal),
    })
  } catch (error) {
    if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      throw abortError()
    }
    throw new Error("通义万相连接失败，请稍后重试")
  }
  const submitPayload = await readJson(submit)
  const submitMessage = messageFromPayload(submitPayload)
  if (
    submit.status === 401 ||
    submit.status === 403 ||
    /api[- ]?key|access.?key|unauthorized/i.test(submitMessage)
  ) {
    throw new Error("平台图像服务密钥无效，请联系管理员")
  }
  if (!submit.ok) throw new Error(`通义万相请求失败：${submitMessage}`)

  let imageUrl = ""
  if (usesReferenceImages) {
    imageUrl = parseAliyunImageEditResult(submitPayload)
  } else {
    const taskId = parseAliyunTaskSubmission(submitPayload)
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (input.signal?.aborted) throw abortError()
      if (attempt > 0) await sleep(500)
      let response: Response
      try {
        response = await fetchImpl(`${ALIYUN_IMAGE_BASE_URL}/tasks/${encodeURIComponent(taskId)}`, {
          method: "GET",
          headers: { Authorization: `Bearer ${config.apiKey}` },
          signal: timeoutSignal(30_000, input.signal),
        })
      } catch (error) {
        if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
          throw abortError()
        }
        continue
      }
      const payload = await readJson(response)
      if (!response.ok) continue
      const result = parseAliyunTaskResult(payload)
      if (result.status === "SUCCEEDED") {
        imageUrl = result.imageUrl
        break
      }
      if (result.status === "FAILED" || result.status === "CANCELED") {
        throw new Error(`通义万相生成失败：${result.error}`)
      }
    }
    if (!imageUrl) throw new Error("通义万相生成超时，请稍后重试")
  }

  const imageResponse = await fetchImpl(imageUrl, {
    method: "GET",
    signal: timeoutSignal(60_000, input.signal),
  })
  if (!imageResponse.ok) throw new Error("通义万相图片下载失败，请重新生成")
  const length = Number(imageResponse.headers.get("content-length") ?? 0)
  if (length > 15 * 1024 * 1024) throw new Error("关键帧图片超过 15MB，已拒绝保存")
  const bytes = new Uint8Array(await imageResponse.arrayBuffer())
  if (bytes.length === 0) throw new Error("通义万相返回了空图片")
  if (bytes.length > 15 * 1024 * 1024) throw new Error("关键帧图片超过 15MB，已拒绝保存")
  return { bytes, mime: sniffImageMime(bytes) }
}
