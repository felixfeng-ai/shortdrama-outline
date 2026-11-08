// 服务端统一生成快速创作报价，页面入口和项目状态接口必须使用同一份预算。
import {
  buildQuickCreationQuotes,
  type QuickCreationQuotes,
  type QuickCreationVideoPrice,
} from "./quick-trial"
import {
  estimateVideoCostMicros,
  getPublicVideoCapabilities,
} from "../video/model.ts"

export function getQuickCreationQuotes(): QuickCreationQuotes {
  const capabilities = getPublicVideoCapabilities()
  const model = capabilities.defaultModel
  const resolution = capabilities.defaultResolution
  const durationSeconds = 5
  let costMicros = 0
  try {
    costMicros = estimateVideoCostMicros({
      model,
      resolution,
      duration: durationSeconds,
    })
  } catch {
    // 配置异常时仍保留故事和首帧报价。
  }
  const video: QuickCreationVideoPrice = {
    enabled: capabilities.enabled && costMicros > 0,
    model,
    resolution,
    durationSeconds,
    costMicros,
  }
  return buildQuickCreationQuotes(video)
}
