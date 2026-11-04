import { resolveApiBaseUrl, type WorkspaceGenerationTarget } from './workspace-api.ts';

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export interface GeneratedTaskResult {
  task: { id: string; status: string };
  asset: { id: string };
  referenceCount: number;
}

export async function generateWorkspaceTarget(
  baseUrl: string,
  input: WorkspaceGenerationTarget & {
    projectId: string;
    referenceImages?: Array<{ base64: string; mime: string }>;
  },
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<GeneratedTaskResult> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置生成服务地址');
  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/generations`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接生成服务，请检查网络后重试');
  }
  const payload = await response.json().catch(() => null) as ApiEnvelope<GeneratedTaskResult> | null;
  if (!response.ok || !payload?.success || !payload.data?.asset?.id) {
    throw new Error(payload?.error || '画面生成失败');
  }
  return payload.data;
}
