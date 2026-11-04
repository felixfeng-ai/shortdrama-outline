import { resolveApiBaseUrl } from './workspace-api.ts';

export async function createProjectReviewLink(
  baseUrl: string,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; token: string; url: string; expiresAt: number }> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置审阅服务地址');
  const response = await fetchImpl(`${root}/api/project-shares`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  }).catch(() => {
    throw new Error('无法连接审阅服务，请检查网络后重试');
  });
  const payload = await response.json().catch(() => null) as {
    success?: boolean;
    data?: { share?: { id: string; token: string; path: string; expiresAt: number } };
    error?: string | null;
  } | null;
  if (!response.ok || !payload?.success || !payload.data?.share) {
    throw new Error(payload?.error || '审阅链接生成失败');
  }
  const share = payload.data.share;
  return {
    id: share.id,
    token: share.token,
    expiresAt: share.expiresAt,
    url: `${root}${share.path}`,
  };
}
