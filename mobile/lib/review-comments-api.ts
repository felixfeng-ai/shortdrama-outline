import { resolveApiBaseUrl } from './workspace-api.ts';
import { fetchWithRetry } from './network.ts';

export type ReviewCommentKind = 'comment' | 'reject' | 'take' | 'timecode' | 'final';
export type ReviewContinuityStatus = 'not_checked' | 'passed' | 'issues';

export interface ReviewComment {
  id: string;
  projectId: string;
  targetType: 'character' | 'place' | 'episode' | 'shot';
  targetId: string;
  targetName: string;
  body: string;
  status: 'open' | 'resolved';
  kind: ReviewCommentKind;
  timecodeMs: number | null;
  frameMarked: boolean;
  isBest: boolean;
  continuityStatus: ReviewContinuityStatus;
  continuitySummary: string;
  continuityIssueCount: number;
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
    kind: ['comment', 'reject', 'take', 'timecode', 'final'].includes(String(item.kind))
      ? item.kind as ReviewCommentKind
      : 'comment',
    timecodeMs: Number.isFinite(Number(item.timecodeMs))
      ? Math.max(0, Number(item.timecodeMs))
      : null,
    frameMarked: item.frameMarked === true,
    isBest: item.isBest === true,
    continuityStatus: item.continuityStatus === 'passed' || item.continuityStatus === 'issues'
      ? item.continuityStatus
      : 'not_checked',
    continuitySummary: typeof item.continuitySummary === 'string'
      ? item.continuitySummary
      : '',
    continuityIssueCount: Math.max(0, Math.floor(Number(item.continuityIssueCount) || 0)),
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

export async function fetchProjectReviewComments(
  baseUrl: string,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewComment[]> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置批注服务地址');
  const response = await fetchWithRetry(
    `${root}/api/projects/${encodeURIComponent(projectId)}/comments`,
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
    kind?: ReviewCommentKind;
    timecodeMs?: number | null;
    frameMarked?: boolean;
    isBest?: boolean;
    continuityStatus?: ReviewContinuityStatus;
    continuitySummary?: string;
    continuityIssueCount?: number;
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
        kind: input.kind ?? 'comment',
        timecodeMs: input.timecodeMs ?? null,
        frameMarked: input.frameMarked === true,
        isBest: input.kind === 'take' && input.isBest === true,
        continuityStatus: input.continuityStatus ?? 'not_checked',
        continuitySummary: input.continuitySummary ?? '',
        continuityIssueCount: Math.max(0, Math.floor(input.continuityIssueCount ?? 0)),
      }),
    },
  );
  return readComment((await readEnvelope<{ comment: unknown }>(response)).comment);
}

export async function markBestReviewComment(
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
      body: JSON.stringify({ isBest: true }),
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

export function timecodeLabel(value: number | null): string {
  if (!Number.isFinite(value) || value === null || value < 0) return '--:--.-';
  const totalTenths = Math.floor(value / 100);
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}
