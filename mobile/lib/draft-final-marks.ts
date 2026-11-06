import type { ReviewComment } from './review-comments-api.ts';
import { resolveApiBaseUrl } from './workspace-api.ts';

export const DRAFT_FINAL_MARKER = '【定稿】';
export const DRAFT_FINAL_BODY = `${DRAFT_FINAL_MARKER}草片通过，后续 768P/2K 出片`;

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

function readComment(value: unknown): ReviewComment {
  if (!value || typeof value !== 'object') throw new Error('定稿标记数据无法识别');
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string'
    || typeof item.projectId !== 'string'
    || typeof item.targetId !== 'string'
    || typeof item.body !== 'string'
  ) {
    throw new Error('定稿标记数据无法识别');
  }
  return {
    id: item.id,
    projectId: item.projectId,
    targetType: 'shot',
    targetId: item.targetId,
    targetName: typeof item.targetName === 'string' ? item.targetName : item.targetId,
    body: item.body,
    status: item.status === 'resolved' ? 'resolved' : 'open',
    kind: item.kind === 'final' || item.body.startsWith(DRAFT_FINAL_MARKER)
      ? 'final'
      : 'comment',
    timecodeMs: Number.isFinite(Number(item.timecodeMs)) ? Number(item.timecodeMs) : null,
    frameMarked: item.frameMarked === true,
    isBest: item.isBest === true,
    continuityStatus: 'not_checked',
    continuitySummary: '',
    continuityIssueCount: 0,
    authorId: typeof item.authorId === 'string' ? item.authorId : '',
    createdAt: Number(item.createdAt) || 0,
    updatedAt: Number(item.updatedAt) || Number(item.createdAt) || 0,
    resolvedAt: Number.isFinite(Number(item.resolvedAt)) ? Number(item.resolvedAt) : null,
  };
}

export function isDraftFinalMark(comment: ReviewComment): boolean {
  return comment.targetType === 'shot'
    && comment.status === 'open'
    && (comment.kind === 'final' || comment.body.startsWith(DRAFT_FINAL_MARKER));
}

export function draftFinalTargetIds(comments: readonly ReviewComment[]): Set<string> {
  return new Set(comments.filter(isDraftFinalMark).map((comment) => comment.targetId));
}

export function findDraftFinalMark(
  comments: readonly ReviewComment[],
  targetId: string,
): ReviewComment | null {
  return comments.find((comment) => isDraftFinalMark(comment) && comment.targetId === targetId)
    ?? null;
}

export async function loadDraftFinalMarks(
  baseUrl: string,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewComment[]> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置定稿标记服务地址');
  const response = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/comments?targetType=shot`,
    { credentials: 'include', headers: { Accept: 'application/json' } },
  );
  const payload = await response.json().catch(() => null) as
    ApiEnvelope<{ comments: unknown[] }> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || '定稿标记读取失败');
  }
  return payload.data.comments.map(readComment).filter(isDraftFinalMark);
}

export async function markDraftShotForFinal(
  baseUrl: string,
  projectId: string,
  shot: { targetId: string; targetName?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewComment> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置定稿标记服务地址');
  const response = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/comments`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetType: 'shot',
        targetId: shot.targetId,
        body: DRAFT_FINAL_BODY,
        kind: 'final',
      }),
    },
  );
  const payload = await response.json().catch(() => null) as
    ApiEnvelope<{ comment: unknown }> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || '定稿标记写入失败');
  }
  return readComment(payload.data.comment);
}

export async function resolveDraftShotFinal(
  baseUrl: string,
  projectId: string,
  commentId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ReviewComment> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置定稿标记服务地址');
  const response = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/comments/${encodeURIComponent(commentId)}`,
    {
      method: 'PATCH',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resolved' }),
    },
  );
  const payload = await response.json().catch(() => null) as
    ApiEnvelope<{ comment: unknown }> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || '定稿标记取消失败');
  }
  return readComment(payload.data.comment);
}
