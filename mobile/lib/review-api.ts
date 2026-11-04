import { resolveApiBaseUrl } from './workspace-api.ts';
import type { WorkspaceTaskTargetType } from './workspace-api.ts';
import { fetchWithRetry } from './network.ts';

export interface ReviewTask {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  assetId: string | null;
  createdAt: number;
  finishedAt: number | null;
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
  let response: Response;
  try {
    response = await fetchWithRetry(`${root}/api/generations?${params.toString()}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    }, { fetchImpl });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接审片服务，请检查网络后重试');
  }
  return readReviewState(await readEnvelope<unknown>(response));
}

export async function selectReviewAsset(
  baseUrl: string,
  projectId: string,
  assetId: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ReviewAsset> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置工作区地址');
  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/generations`, {
      method: 'PATCH',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectId, assetId }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接审片服务，请检查网络后重试');
  }
  const data = await readEnvelope<{ asset: unknown }>(response);
  return readAsset(data.asset);
}
