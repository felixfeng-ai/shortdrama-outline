import { PROJECTS, activeProject, type ProjectSummary } from './app-data.ts';
import { fetchWithRetry } from './network.ts';

export const workspaceApiBaseUrl = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL);

export interface WorkspaceProject extends ProjectSummary {
  hasDetails: boolean;
}

export interface WorkspaceHero {
  episodeNumber: number;
  episodeTitle: string;
  sceneNumber: number;
  sceneLocation: string;
  timeOfDay: string;
  sceneSummary: string;
  shotNumber: number | null;
  shotCount: number;
  contextBadge: string;
  agentContextLabel: string;
  targetLabel: string;
  evidence: string;
}

export interface WorkspaceQuota {
  remaining: number;
  limit: number;
  used: number;
  projectsLeft: number;
}

export type WorkspaceTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
export type WorkspaceTaskTargetType = 'character' | 'place' | 'shot';

export interface WorkspaceTask {
  id: string;
  targetType: WorkspaceTaskTargetType;
  targetId: string;
  targetLabel: string;
  status: WorkspaceTaskStatus;
  error: string | null;
  assetId: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface WorkspaceData {
  activeProject: WorkspaceProject | null;
  projects: WorkspaceProject[];
  totalProjects: number;
  hero: WorkspaceHero | null;
  quota: WorkspaceQuota;
  tasks: WorkspaceTask[];
}

export interface AgentProjectContext {
  projectTitle: string;
  contextLabel: string;
  targetLabel: string;
  evidence: string;
  shotCount: number;
  sceneLabel: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

const demoProject: WorkspaceProject = {
  ...activeProject(),
  shotCount: 24,
  hasDetails: true,
};

export const demoWorkspace: WorkspaceData = {
  activeProject: demoProject,
  projects: PROJECTS.map((project, index) => ({
    ...project,
    shotCount: index === 0 ? 24 : project.shotCount,
    hasDetails: true,
  })),
  totalProjects: PROJECTS.length,
  hero: {
    episodeNumber: 3,
    episodeTitle: '潮汐之后',
    sceneNumber: 12,
    sceneLocation: '码头夜谈',
    timeOfDay: '夜外',
    sceneSummary: '林昭把信递出去之后',
    shotNumber: 17,
    shotCount: 24,
    contextBadge: 'EP03 · 场 12',
    agentContextLabel: '夜港来信 · 第 3 集 · 场 12',
    targetLabel: 'EP03 · 场 12 · 第 17 镜',
    evidence: '24 个镜头 · 潮汐之后 · 码头夜谈',
  },
  quota: {
    remaining: 18,
    limit: 60,
    used: 42,
    projectsLeft: 1,
  },
  tasks: [],
};

export function resolveApiBaseUrl(value: string | undefined): string {
  return (value ?? '').trim().replace(/\/+$/, '');
}

function readWorkspace(value: unknown): WorkspaceData {
  if (!value || typeof value !== 'object') {
    throw new Error('工作区返回了无法识别的内容');
  }
  const data = value as Partial<WorkspaceData>;
  if (!data.quota || typeof data.quota !== 'object') {
    throw new Error('工作区缺少额度信息');
  }
  return {
    activeProject: (data.activeProject as WorkspaceProject | null | undefined) ?? null,
    projects: Array.isArray(data.projects) ? (data.projects as WorkspaceProject[]) : [],
    totalProjects: Number.isFinite(data.totalProjects) ? Number(data.totalProjects) : 0,
    hero: (data.hero as WorkspaceHero | null | undefined) ?? null,
    quota: data.quota as WorkspaceQuota,
    tasks: Array.isArray(data.tasks) ? (data.tasks as WorkspaceTask[]) : [],
  };
}

export async function fetchWorkspace(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
  projectId?: string | null,
): Promise<WorkspaceData> {
  const root = resolveApiBaseUrl(baseUrl);
  if (!root) throw new Error('尚未配置工作区地址');
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';

  let response: Response;
  try {
    response = await fetchWithRetry(`${root}/api/mobile/context${query}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    }, { fetchImpl });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new Error('无法连接工作区，请检查网络后重试');
  }

  let payload: ApiEnvelope<WorkspaceData>;
  try {
    payload = (await response.json()) as ApiEnvelope<WorkspaceData>;
  } catch {
    throw new Error('工作区返回了无法识别的内容');
  }
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error || '工作区同步失败');
  }
  return readWorkspace(payload.data);
}

export function workspaceToAgentContext(
  workspace: WorkspaceData,
  project: WorkspaceProject | null = workspace.activeProject,
): AgentProjectContext {
  const title = project?.title ?? '未选择项目';
  const shotCount = workspace.hero?.shotCount ?? project?.shotCount ?? 0;
  return {
    projectTitle: title,
    contextLabel: workspace.hero?.agentContextLabel ?? title,
    targetLabel: workspace.hero?.targetLabel ?? '等待项目内容',
    evidence: workspace.hero?.evidence ?? `${shotCount} 个镜头`,
    shotCount,
    sceneLabel: workspace.hero?.sceneLocation ?? title,
  };
}
