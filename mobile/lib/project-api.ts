import { resolveApiBaseUrl } from './workspace-api.ts';

export interface RemoteProject {
  id: string;
  title: string;
  ownerId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectImportResult {
  project: RemoteProject;
  counts: {
    snapshots: number;
    tasks: number;
    keyframes: number;
    refs: number;
    sources?: number;
  };
  warnings: string[];
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export function validateProjectTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error('项目名不能为空');
  if (title.length > 100) throw new Error('项目名太长了，请控制在 100 字以内');
  return title;
}

async function readPayload<T>(response: Response, fallback: string): Promise<T> {
  let payload: ApiEnvelope<T>;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new Error(`${fallback}：服务返回了无法识别的内容`);
  }
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || fallback);
  }
  return payload.data;
}

export async function createWorkspaceProject(
  baseUrl: string,
  rawTitle: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<RemoteProject> {
  const root = resolveApiBaseUrl(baseUrl);
  const title = validateProjectTitle(rawTitle);
  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/projects`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Chengju-Client': 'app',
      },
      body: JSON.stringify({ title }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法创建项目，请检查网络后重试');
  }
  return (await readPayload<{ project: RemoteProject }>(response, '创建项目失败')).project;
}

export async function loadSampleWorkspaceProject(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<RemoteProject> {
  const root = resolveApiBaseUrl(baseUrl);
  const response = await fetchImpl(`${root}/api/sample`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Chengju-Client': 'app',
    },
    body: '{}',
    signal,
  });
  return (await readPayload<{ project: RemoteProject }>(response, '示例项目载入失败')).project;
}

export async function importWorkspaceProject(
  baseUrl: string,
  form: FormData,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ProjectImportResult> {
  const root = resolveApiBaseUrl(baseUrl);
  let response: Response;
  try {
    response = await fetchImpl(`${root}/api/project-import`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'X-Chengju-Client': 'app',
      },
      body: form,
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法导入项目包，请检查网络后重试');
  }
  return readPayload<ProjectImportResult>(response, '项目包导入失败');
}
