import { resolveApiBaseUrl } from './workspace-api.ts';
import { fetchWithRetry } from './network.ts';

export interface ReviewComment {
  id: string;
  projectId: string;
  targetType: 'character' | 'place' | 'episode' | 'shot';
  targetId: string;
  targetName: string;
  body: string;
  status: 'open' | 'resolved';
  authorId: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

function readComment(value: unknown): ReviewComment {
  if (!value || typeof value !== 'object') throw new Error('批注数据无法识别');
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string'
    || typeof item.projectId !== 'string'
    || typeof item.targetId !== 'string'
    || typeof item.body !== 'string'
  ) {
    throw new Error('批注数据无法识别');
  }
  return {
    id: item.id,
    projectId: item.projectId,
    targetType: item.targetType === 'character'
      || item.targetType === 'place'
      || item.targetType === 'episode'
      ? item.targetType
      : 'shot',
    targetId: item.targetId,
    targetName: typeof item.targetName === 'string' ? item.targetName : item.targetId,
    body: item.body,
    status: item.status === 'resolved' ? 'resolved' : 'open',
    authorId: typeof item.authorId === 'string' ? item.authorId : '',
    createdAt: Number(item.createdAt) || 0,
    updatedAt: Number(item.updatedAt) || Number(item.createdAt) || 0,
    resolvedAt: Number.isFinite(Number(item.resolvedAt)) ? Number(item.resolvedAt) : null,
  };
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || payload.data === null) {
    throw new Error(payload?.error || '批注服务暂不可用');
  }
  return payload.data;
}

export async function fetchReviewComments(
  baseUrl: string,
  projectId: string,
  targetId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewComment[]> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置批注服务地址');
  const query = new URLSearchParams({ targetType: 'shot', targetId });
  const response = await fetchWithRetry(
    `${root}/api/projects/${encodeURIComponent(projectId)}/comments?${query.toString()}`,
    { credentials: 'include', headers: { Accept: 'application/json' } },
    { fetchImpl },
  );
  const data = await readEnvelope<{ comments: unknown[] }>(response);
  return data.comments.map(readComment);
}

export async function createReviewComment(
  baseUrl: string,
  projectId: string,
  input: {
    targetType: 'shot';
    targetId: string;
    body: string;
    kind?: 'comment' | 'reject';
  },
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewComment> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置批注服务地址');
  const body = input.body.trim();
  if (!body) throw new Error('请写下批注或退回原因');
  const response = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/comments`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: input.targetType,
        targetId: input.targetId,
        body: input.kind === 'reject' ? `【退回】${body}` : body,
      }),
    },
  );
  return readComment((await readEnvelope<{ comment: unknown }>(response)).comment);
}

export async function resolveReviewComment(
  baseUrl: string,
  projectId: string,
  commentId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewComment> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置批注服务地址');
  const response = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    },
  );
  return readComment((await readEnvelope<{ comment: unknown }>(response)).comment);
}
