import { resolveApiBaseUrl, type WorkspaceTask } from './workspace-api.ts';

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function sendTaskAction(
  baseUrl: string,
  input: { action: 'cancel' | 'retry'; projectId: string; taskId: string },
  fetchImpl: typeof fetch,
): Promise<{ task: WorkspaceTask }> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置生成服务地址');
  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/generations`, {
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
): Promise<{ task: WorkspaceTask }> {
  return sendTaskAction(baseUrl, { action: 'cancel', projectId, taskId }, fetchImpl);
}

export function retryWorkspaceTask(
  baseUrl: string,
  projectId: string,
  taskId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ task: WorkspaceTask }> {
  return sendTaskAction(baseUrl, { action: 'retry', projectId, taskId }, fetchImpl);
}
