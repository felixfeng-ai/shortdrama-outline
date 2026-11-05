import {
  resolveApiBaseUrl,
  type WorkspaceBatch,
  type WorkspaceTask,
  type WorkspaceVideoCapabilities,
  type WorkspaceVideoTarget,
} from './workspace-api.ts';
import { estimatePublicVideoCostMicros } from './video-entry.ts';

export const DRAFT_MODEL = 'MiniMax-H3-Lite';
export const DRAFT_RESOLUTION = '480P';
export const DRAFT_SECONDS = 5;

export type DraftShotTarget = WorkspaceVideoTarget;

export interface DraftBatchEstimate {
  totalCount: number;
  readyCount: number;
  blockedCount: number;
  estimatedCostMicros: number;
  budgetLimitMicros: number;
}

export interface DraftBatchResult {
  batch: WorkspaceBatch | null;
  tasks: WorkspaceTask[];
  blocked: Array<{ targetId: string; reason: string }>;
  failures: Array<{ targetId: string; reason: string }>;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function isDraftTargetReady(target: DraftShotTarget): boolean {
  return Boolean(target.selectedFrameAssetId) && !target.blockedReason;
}

/**
 * 分集是草片页唯一的镜头范围。默认按镜头号排列，保证手机上的审片顺序与分镜一致。
 */
export function filterDraftTargets(
  targets: readonly DraftShotTarget[],
  episode: number,
  onlyReady = false,
): DraftShotTarget[] {
  return targets
    .filter((target) => target.episode === episode)
    .filter((target) => !onlyReady || isDraftTargetReady(target))
    .sort((left, right) => left.shotNumber - right.shotNumber);
}

export function estimateDraftBatch(
  capabilities: WorkspaceVideoCapabilities,
  targets: readonly DraftShotTarget[],
): DraftBatchEstimate {
  const ready = targets.filter(isDraftTargetReady);
  const estimatedCostMicros = ready.reduce(
    (sum) => sum + estimatePublicVideoCostMicros(
      capabilities,
      DRAFT_MODEL,
      DRAFT_RESOLUTION,
      DRAFT_SECONDS,
    ),
    0,
  );
  return {
    totalCount: targets.length,
    readyCount: ready.length,
    blockedCount: targets.length - ready.length,
    estimatedCostMicros,
    // 草片预算只覆盖已经准备好首帧的镜头，缺首帧镜头不占用预算。
    budgetLimitMicros: estimatedCostMicros,
  };
}

export async function submitDraftBatch(
  baseUrl: string,
  input: {
    projectId: string;
    targets: readonly DraftShotTarget[];
    capabilities: WorkspaceVideoCapabilities;
    idempotencyKey: string;
  },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<DraftBatchResult> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置草片生成服务地址');
  if (input.targets.length === 0) throw new Error('当前集还没有镜头');
  const estimate = estimateDraftBatch(input.capabilities, input.targets);
  if (estimate.readyCount === 0) throw new Error('当前集还没有可生成的镜头');

  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/video/generations/batch`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: input.projectId,
        shots: input.targets.map((target) => ({
          targetId: target.targetId,
          ...(target.selectedFrameAssetId
            ? { sourceAssetId: target.selectedFrameAssetId }
            : {}),
          prompt: target.prompt,
          duration: DRAFT_SECONDS,
          ratio: target.ratio,
        })),
        model: DRAFT_MODEL,
        resolution: DRAFT_RESOLUTION,
        budgetLimitMicros: estimate.budgetLimitMicros,
        idempotencyKey: input.idempotencyKey,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接草片生成服务，请检查网络后重试');
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<DraftBatchResult> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || '整集草片提交失败');
  }
  return {
    batch: payload.data.batch ?? null,
    tasks: Array.isArray(payload.data.tasks) ? payload.data.tasks : [],
    blocked: Array.isArray(payload.data.blocked) ? payload.data.blocked : [],
    failures: Array.isArray(payload.data.failures) ? payload.data.failures : [],
  };
}

export function newDraftBatchKey(
  now = Date.now(),
  random: () => number = Math.random,
): string {
  // 单字符随机尾缀配合毫秒时间戳，既方便排查，也与按钮防重复提交共同兜底。
  const suffix = Math.floor(random() * 36).toString(36);
  return `mobile-draft-${now}-${suffix}`;
}
