import { resolveApiBaseUrl } from './workspace-api.ts';
import type {
  WorkspaceTaskMediaKind,
  WorkspaceTaskTargetType,
} from './workspace-api.ts';
import { fetchWithRetry } from './network.ts';

export interface ReviewTask {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  assetId: string | null;
  createdAt: number;
  finishedAt: number | null;
  mediaKind: WorkspaceTaskMediaKind;
}

export interface ReviewAsset {
  id: string;
  taskId: string;
  projectId: string;
  targetType: WorkspaceTaskTargetType;
  targetId: string;
  storageKey: string;
  mime: string;
  bytes: number;
  providerId: string;
  model: string;
  prompt: string;
  mediaKind: WorkspaceTaskMediaKind;
  durationMs: number | null;
  selectedAt: number | null;
  createdAt: number;
  downloadUrl: string;
}

export interface ReviewState {
  tasks: ReviewTask[];
  assets: ReviewAsset[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('审片数据无法识别');
  return value as Record<string, unknown>;
}

function readAsset(value: unknown): ReviewAsset {
  const item = asRecord(value);
  const targetType = item.targetType;
  if (
    typeof item.id !== 'string'
    || typeof item.taskId !== 'string'
    || typeof item.projectId !== 'string'
    || (targetType !== 'shot' && targetType !== 'character' && targetType !== 'place')
    || typeof item.targetId !== 'string'
    || typeof item.downloadUrl !== 'string'
    || typeof item.mime !== 'string'
    || !Number.isFinite(Number(item.bytes))
    || !Number.isFinite(Number(item.createdAt))
  ) {
    throw new Error('审片数据无法识别');
  }
  return {
    id: item.id,
    taskId: item.taskId,
    projectId: item.projectId,
    targetType,
    targetId: item.targetId,
    storageKey: typeof item.storageKey === 'string' ? item.storageKey : '',
    mime: item.mime,
    bytes: Number(item.bytes),
    providerId: typeof item.providerId === 'string' ? item.providerId : '',
    model: typeof item.model === 'string' ? item.model : '',
    prompt: typeof item.prompt === 'string' ? item.prompt : '',
    mediaKind: item.mediaKind === 'video' || item.mediaKind === 'audio'
      ? item.mediaKind
      : 'image',
    durationMs: Number.isFinite(Number(item.durationMs)) ? Number(item.durationMs) : null,
    selectedAt: Number.isFinite(Number(item.selectedAt)) ? Number(item.selectedAt) : null,
    createdAt: Number(item.createdAt),
    downloadUrl: item.downloadUrl,
  };
}

function readTask(value: unknown): ReviewTask {
  const item = asRecord(value);
  const status = item.status;
  if (
    typeof item.id !== 'string'
    || !['queued', 'running', 'succeeded', 'failed', 'canceled'].includes(String(status))
    || !Number.isFinite(Number(item.createdAt))
  ) {
    throw new Error('审片任务数据无法识别');
  }
  return {
    id: item.id,
    status: status as ReviewTask['status'],
    assetId: typeof item.assetId === 'string' ? item.assetId : null,
    createdAt: Number(item.createdAt),
    finishedAt: Number.isFinite(Number(item.finishedAt)) ? Number(item.finishedAt) : null,
    mediaKind: item.mediaKind === 'video' || item.mediaKind === 'audio'
      ? item.mediaKind
      : 'image',
  };
}

export function readReviewState(value: unknown): ReviewState {
  const data = asRecord(value);
  if (!Array.isArray(data.assets) || !Array.isArray(data.tasks)) {
    throw new Error('审片数据无法识别');
  }
  return {
    tasks: data.tasks.map(readTask),
    assets: data.assets.map(readAsset),
  };
}

async function readEnvelope<T>(response: Response): Promise<T> {
  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error('审片服务返回了无法识别的内容');
  }
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || '审片数据读取失败');
  }
  return payload.data;
}

export async function fetchReviewState(
  baseUrl: string,
  projectId: string,
  targetType: WorkspaceTaskTargetType,
  targetId: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ReviewState> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置工作区地址');
  const params = new URLSearchParams({ projectId, targetType, targetId });
  const load = (path: string) => {
    const video = path.includes('/api/video/')
    const query = video
      ? new URLSearchParams({ projectId, targetId })
      : params
    return fetchWithRetry(`${root}${path}?${query.toString()}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    }, { fetchImpl }).then(readEnvelope<unknown>).then(readReviewState)
  }

  const [images, videos] = await Promise.allSettled([
    load('/api/generations'),
    load('/api/video/generations'),
  ])
  if (images.status === 'rejected') {
    const reason = images.reason
    if (reason instanceof Error && reason.name === 'AbortError') throw reason
    throw reason instanceof Error
      ? reason
      : new Error('无法连接审片服务，请检查网络后重试')
  }
  if (videos.status === 'rejected') {
    const reason = videos.reason
    if (reason instanceof Error && reason.name === 'AbortError') throw reason
    // 老服务端没有视频路由时，图片审片仍然可用；视频选择会在提交时明确失败。
  }
  const videoState = videos.status === 'fulfilled'
    ? videos.value
    : { tasks: [], assets: [] }
  return {
    tasks: uniqueById([...images.value.tasks, ...videoState.tasks]),
    assets: uniqueById([...images.value.assets, ...videoState.assets]),
  }
}

export async function selectReviewAsset(
  baseUrl: string,
  projectId: string,
  assetId: string,
  options: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    mediaKind?: WorkspaceTaskMediaKind;
  } = {},
): Promise<ReviewAsset> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置工作区地址');
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    const path = options.mediaKind === 'video'
      ? '/api/video/generations'
      : '/api/generations';
    response = await fetchImpl(`${root}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectId, assetId }),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接审片服务，请检查网络后重试');
  }
  const data = await readEnvelope<{ asset: unknown }>(response);
  return readAsset(data.asset);
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
