import type { AgentSessionState } from './agent-session.ts';
import { resolveApiBaseUrl } from './workspace-api.ts';

type AgentMessageRole = 'user' | 'assistant' | 'note';

interface RemoteMessage {
  id: string;
  threadId: string;
  role: AgentMessageRole;
  content: string;
  createdAt: number;
}

interface RemoteThread {
  id: string;
  projectId: string;
  ownerId: string;
  title: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  messages?: RemoteMessage[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function readEnvelope<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    throw new Error(payload?.error || fallback);
  }
  return payload.data;
}

function messageList(value: unknown): RemoteMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RemoteMessage =>
    Boolean(item)
    && typeof item === 'object'
    && typeof (item as RemoteMessage).id === 'string'
    && typeof (item as RemoteMessage).content === 'string'
    && ['user', 'assistant', 'note'].includes((item as RemoteMessage).role),
  );
}

export async function listAgentThreads(
  baseUrl: string,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteThread[]> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置 Agent 服务地址');
  const response = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/threads`,
    { credentials: 'include', headers: { Accept: 'application/json' } },
  );
  const data = await readEnvelope<{ threads?: RemoteThread[] }>(response, '会话列表读取失败');
  return Array.isArray(data.threads) ? data.threads : [];
}

export async function createAgentThread(
  baseUrl: string,
  projectId: string,
  title: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteThread> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置 Agent 服务地址');
  const response = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/threads`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim().slice(0, 120) }),
    },
  );
  const data = await readEnvelope<{ thread?: RemoteThread }>(response, '会话创建失败');
  if (!data.thread?.id) throw new Error('会话创建结果不完整');
  return data.thread;
}

export async function getAgentThread(
  baseUrl: string,
  projectId: string,
  threadId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteThread> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置 Agent 服务地址');
  const response = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}`,
    { credentials: 'include', headers: { Accept: 'application/json' } },
  );
  const data = await readEnvelope<{ thread?: RemoteThread }>(response, '会话读取失败');
  if (!data.thread?.id) throw new Error('会话读取结果不完整');
  return { ...data.thread, messages: messageList(data.thread.messages) };
}

export async function appendAgentMessage(
  baseUrl: string,
  projectId: string,
  threadId: string,
  input: { role: AgentMessageRole; content: string },
  fetchImpl: typeof fetch = fetch,
): Promise<RemoteMessage> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置 Agent 服务地址');
  const response = await fetchImpl(
    `${root}/api/projects/${encodeURIComponent(projectId)}/threads/${encodeURIComponent(threadId)}/messages`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  const data = await readEnvelope<{ message?: RemoteMessage }>(response, '会话消息保存失败');
  if (!data.message?.id) throw new Error('会话消息保存结果不完整');
  return data.message;
}

/**
 * 只恢复最近一轮已经完成的问答。没有 assistant 的未完成用户消息不冒充答案。
 */
export async function loadRemoteAgentSession(
  baseUrl: string,
  projectId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AgentSessionState | null> {
  const threads = await listAgentThreads(baseUrl, projectId, fetchImpl);
  const latest = threads[0];
  if (!latest) return null;
  const thread = await getAgentThread(baseUrl, projectId, latest.id, fetchImpl);
  const messages = thread.messages ?? [];
  const userIndex = messages.map((message) => message.role).lastIndexOf('user');
  if (userIndex < 0) return null;
  const user = messages[userIndex];
  const assistant = messages
    .slice(userIndex + 1)
    .find((message) => message.role === 'assistant');
  if (!assistant) return null;
  return {
    mode: 'chat',
    phase: 'proposed',
    draft: '',
    submittedMode: 'chat',
    submittedPrompt: user.content,
    reply: assistant.content,
    remoteThreadId: thread.id,
    toolSteps: [],
  };
}

/**
 * 会话写入失败只影响跨设备恢复，不能阻断用户当前设备上的 Agent。
 */
export async function appendAgentThreadTurn(
  baseUrl: string,
  projectId: string,
  threadId: string | null,
  messages: Array<{ role: AgentMessageRole; content: string }>,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const usable = messages
    .map((message) => ({ role: message.role, content: message.content.trim() }))
    .filter((message) => message.content);
  if (usable.length === 0) {
    if (!threadId) throw new Error('没有可保存的会话消息');
    return threadId;
  }
  const target = threadId || (await createAgentThread(
    baseUrl,
    projectId,
    usable.find((message) => message.role === 'user')?.content || '项目会话',
    fetchImpl,
  )).id;
  for (const message of usable) {
    await appendAgentMessage(baseUrl, projectId, target, message, fetchImpl);
  }
  return target;
}

export type { RemoteMessage, RemoteThread };
