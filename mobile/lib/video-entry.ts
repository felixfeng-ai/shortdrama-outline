import {
  resolveApiBaseUrl,
  type WorkspaceVideoCapabilities,
  type WorkspaceVideoModelCapability,
} from './workspace-api.ts';

export type { WorkspaceVideoCapabilities } from './workspace-api.ts';

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface VideoGenerationResult {
  task: {
    id: string;
    status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
    mediaKind?: 'video';
  };
  asset: null;
  reused?: boolean;
}

export type VideoGenerationMode = 'image-to-video' | 'text-to-video';

export function videoModelCapability(
  capabilities: WorkspaceVideoCapabilities,
  modelId: string,
): WorkspaceVideoModelCapability | null {
  return capabilities.models.find((model) => model.id === modelId) ?? null;
}

export function estimatePublicVideoCostMicros(
  capabilities: WorkspaceVideoCapabilities,
  modelId: string,
  resolution: string,
  duration: number,
): number {
  const model = videoModelCapability(capabilities, modelId);
  if (!model) throw new Error('视频模型不可用');
  const price = model.pricesPerSecond[resolution];
  if (!Number.isFinite(price)) throw new Error('视频分辨率不可用');
  const safeDuration = Math.floor(duration);
  if (safeDuration < model.minDuration || safeDuration > model.maxDuration) {
    throw new Error(`视频时长必须在 ${model.minDuration}-${model.maxDuration} 秒`);
  }
  return Math.round(price * safeDuration * 1_000_000);
}

export function videoCostLabel(micros: number): string {
  return `¥${(Math.max(0, micros) / 1_000_000).toFixed(2)}`;
}

export async function generateWorkspaceVideo(
  baseUrl: string,
  input: {
    projectId: string;
    targetId: string;
    sourceAssetId?: string;
    mode?: VideoGenerationMode;
    prompt: string;
    model: string;
    resolution: string;
    duration: number;
    ratio: '9:16' | '16:9';
    maxBudgetMicros: number;
    idempotencyKey: string;
  },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<VideoGenerationResult> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置视频生成服务地址');
  const mode = input.mode ?? 'image-to-video';
  if (mode === 'image-to-video' && !input.sourceAssetId) {
    throw new Error('图生视频需要先采用一张首帧');
  }
  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/video/generations`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        mode,
        autoSelect: false,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接视频生成服务，请检查网络后重试');
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<VideoGenerationResult> | null;
  if (!response.ok || !payload?.success || !payload.data?.task?.id) {
    throw new Error(payload?.error || '视频任务提交失败');
  }
  return payload.data;
}

export function newVideoIdempotencyKey(now = Date.now()): string {
  return `mobile-video-${now}-${Math.random().toString(36).slice(2, 10)}`;
}
