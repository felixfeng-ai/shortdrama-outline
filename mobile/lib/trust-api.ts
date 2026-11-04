import { resolveApiBaseUrl } from './workspace-api.ts';

export type ContentReportReason =
  | 'copyright'
  | 'illegal'
  | 'hate'
  | 'harassment'
  | 'privacy'
  | 'sexual'
  | 'other';

export interface ContentReportInput {
  projectId: string;
  targetType: 'project' | 'asset' | 'comment' | 'share';
  targetId: string;
  reason: ContentReportReason;
  detail: string;
}

export async function submitContentReport(
  baseUrl: string,
  input: ContentReportInput,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; status: string }> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置举报服务地址');
  const response = await fetchImpl(`${root}/api/reports`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => {
    throw new Error('无法连接举报服务，请检查网络后重试');
  });
  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    data?: { report?: { id: string; status: string } };
    error?: string | null;
  } | null;
  if (!response.ok || !payload?.success || !payload.data?.report) {
    throw new Error(payload?.error || '举报提交失败');
  }
  return payload.data.report;
}
