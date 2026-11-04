import { InputError } from "../api.ts"

export interface GenerationReferenceImage {
  bytes: Uint8Array
  mime: string
}

const MAX_REFERENCES = 3
const MAX_BYTES = 5 * 1024 * 1024

function detectedMime(bytes: Uint8Array): string {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return "image/png"
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) return "image/webp"
  return ""
}

export function readClientReferenceImages(value: unknown): GenerationReferenceImage[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > MAX_REFERENCES) {
    throw new InputError("参考图最多 3 张")
  }
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new InputError("参考图格式不正确")
    const record = item as Record<string, unknown>
    const mime = typeof record.mime === "string" ? record.mime : ""
    const base64 = typeof record.base64 === "string" ? record.base64.trim() : ""
    if (mime !== "image/png" && mime !== "image/jpeg" && mime !== "image/webp") {
      throw new InputError("参考图只支持 PNG、JPEG 或 WebP")
    }
    if (!base64 || base64.length > 8_000_000) {
      throw new InputError("参考图过大或内容为空")
    }
    const bytes = new Uint8Array(Buffer.from(base64, "base64"))
    if (bytes.length === 0 || bytes.length > MAX_BYTES) {
      throw new InputError("单张参考图不能超过 5MB")
    }
    if (detectedMime(bytes) !== mime) {
      throw new InputError("参考图内容与声明格式不一致")
    }
    return { bytes, mime }
  })
}

export function mergeGenerationReferences(
  projectImages: GenerationReferenceImage[],
  clientImages: GenerationReferenceImage[],
): GenerationReferenceImage[] {
  return [...projectImages, ...clientImages].slice(0, MAX_REFERENCES)
}
