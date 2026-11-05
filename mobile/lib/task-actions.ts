import {
  resolveApiBaseUrl,
  type WorkspaceTask,
  type WorkspaceTaskMediaKind,
} from './workspace-api.ts';

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function sendTaskAction(
  baseUrl: string,
  input: { action: 'cancel' | 'retry'; projectId: string; taskId: string },
  fetchImpl: typeof fetch,
  mediaKind: WorkspaceTaskMediaKind,
): Promise<{ task: WorkspaceTask }> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置生成服务地址');
  let response: Response;
  try {
    const path = (mediaKind ?? 'image') === 'video'
      ? '/api/video/generations'
      : '/api/generations';
    response = await fetchImpl(`${root}${path}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error('无法连接生成服务，请检查网络后重试');
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<{ task: WorkspaceTask }> | null;
  if (!response.ok || !payload?.success || !payload.data?.task) {
    throw new Error(payload?.error || '任务操作失败');
  }
  return payload.data;
}

export function cancelWorkspaceTask(
  baseUrl: string,
  projectId: string,
  taskId: string,
  fetchImpl: typeof fetch = fetch,
  mediaKind: WorkspaceTaskMediaKind = 'image',
): Promise<{ task: WorkspaceTask }> {
  return sendTaskAction(baseUrl, { action: 'cancel', projectId, taskId }, fetchImpl, mediaKind);
}

export function retryWorkspaceTask(
  baseUrl: string,
  projectId: string,
  taskId: string,
  fetchImpl: typeof fetch = fetch,
  mediaKind: WorkspaceTaskMediaKind = 'image',
): Promise<{ task: WorkspaceTask }> {
  return sendTaskAction(baseUrl, { action: 'retry', projectId, taskId }, fetchImpl, mediaKind);
}
