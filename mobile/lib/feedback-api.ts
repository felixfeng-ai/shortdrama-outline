import { resolveApiBaseUrl } from './workspace-api.ts';

export const FEEDBACK_CATEGORIES = [
  { value: 'agent', label: 'Agent 回答' },
  { value: 'voice', label: '语音与权限' },
  { value: 'video', label: '视频播放与下载' },
  { value: 'generation', label: '生成与草片' },
  { value: 'performance', label: '卡顿与稳定性' },
  { value: 'other', label: '其他问题' },
] as const;

export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number]['value'];

export interface MobileFeedbackInput {
  category: FeedbackCategory;
  body: string;
  appVersion: string;
  buildVersion: string;
  platform: string;
  osVersion: string;
  deviceModel: string;
  screen: string;
}

export interface MobileFeedback extends MobileFeedbackInput {
  id: string;
  status: 'open';
  createdAt: number;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function responseData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || '内测反馈服务暂不可用');
  }
  return payload.data;
}

export async function submitMobileFeedback(
  baseUrl: string,
  input: MobileFeedbackInput,
  fetchImpl: typeof fetch = fetch,
): Promise<MobileFeedback> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置内测反馈服务地址');
  const response = await fetchImpl(`${root}/api/mobile/feedback`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).catch(() => {
    throw new Error('无法连接内测反馈服务，请检查网络');
  });
  const data = await responseData<{ feedback: MobileFeedback }>(response);
  return data.feedback;
}

export async function fetchMobileFeedback(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MobileFeedback[]> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置内测反馈服务地址');
  const response = await fetchImpl(`${root}/api/mobile/feedback`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).catch(() => {
    throw new Error('无法连接内测反馈服务，请检查网络');
  });
  const data = await responseData<{ feedback: MobileFeedback[] }>(response);
  return data.feedback;
}
