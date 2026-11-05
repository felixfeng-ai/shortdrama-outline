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
export type WorkspaceTaskMediaKind = 'image' | 'video' | 'audio';

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
  mediaKind: WorkspaceTaskMediaKind;
  batchId: string | null;
  estimatedCostMicros: number;
  actualCostMicros: number;
}

export interface WorkspaceData {
  activeProject: WorkspaceProject | null;
  projects: WorkspaceProject[];
  totalProjects: number;
  hero: WorkspaceHero | null;
  quota: WorkspaceQuota;
  tasks: WorkspaceTask[];
  generationTargets: WorkspaceGenerationTarget[];
  videoCapabilities: WorkspaceVideoCapabilities;
  videoTargets: WorkspaceVideoTarget[];
  videoReadiness: WorkspaceVideoReadiness;
  batches: WorkspaceBatch[];
  agentMemory: WorkspaceAgentMemory;
}

export interface WorkspaceGenerationTarget {
  targetType: 'character' | 'place' | 'shot';
  targetId: string;
  targetLabel: string;
  prompt: string;
  aspect: 'portrait' | 'landscape' | 'vertical';
}

export interface WorkspaceVideoModelCapability {
  id: string;
  minDuration: number;
  maxDuration: number;
  resolutions: string[];
  pricesPerSecond: Record<string, number>;
}

export interface WorkspaceVideoCapabilities {
  enabled: boolean;
  defaultModel: string;
  defaultResolution: string;
  models: WorkspaceVideoModelCapability[];
}

export interface WorkspaceVideoTarget {
  targetType: 'shot';
  targetId: string;
  targetLabel: string;
  prompt: string;
  duration: number;
  ratio: '9:16' | '16:9';
  selectedFrameAssetId: string | null;
  selectedVideoAssetId: string | null;
  latestTaskStatus: WorkspaceTaskStatus | null;
  blockedReason: string | null;
}

export interface WorkspaceVideoReadiness {
  totalShots: number;
  frameReady: number;
  videoReady: number;
  missingFrame: number;
  missingVideo: number;
  activeTasks: number;
  failedTasks: number;
}

export interface WorkspaceBatch {
  id: string;
  projectId: string;
  episode: number;
  scope: Record<string, unknown>;
  status: 'draft' | 'confirmed' | 'running' | 'completed' | 'stopped' | 'failed';
  budgetLimitMicros: number;
  reservedCostMicros: number;
  actualCostMicros: number;
  idempotencyKey: string | null;
  createdAt: number;
  confirmedAt: number | null;
  finishedAt: number | null;
}

export interface WorkspaceAgentMemory {
  lockedCharacters: string[];
  lockedPlaces: string[];
  acceptedDecisions: string[];
  lockedDecisions: string[];
  rejectedDirections: string[];
  openComments: string[];
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
  generationTargets: [],
  videoCapabilities: {
    enabled: false,
    defaultModel: 'MiniMax-H3-Lite',
    defaultResolution: '768P',
    models: [],
  },
  videoTargets: [],
  videoReadiness: {
    totalShots: 0,
    frameReady: 0,
    videoReady: 0,
    missingFrame: 0,
    missingVideo: 0,
    activeTasks: 0,
    failedTasks: 0,
  },
  batches: [],
  agentMemory: {
    lockedCharacters: [],
    lockedPlaces: [],
    acceptedDecisions: [],
    lockedDecisions: [],
    rejectedDirections: [],
    openComments: [],
  },
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
  const tasks = Array.isArray(data.tasks)
    ? data.tasks.map((task) => ({
        ...task,
        mediaKind: task.mediaKind ?? 'image',
        batchId: task.batchId ?? null,
        estimatedCostMicros: Number(task.estimatedCostMicros) || 0,
        actualCostMicros: Number(task.actualCostMicros) || 0,
      }))
    : [];
  return {
    activeProject: (data.activeProject as WorkspaceProject | null | undefined) ?? null,
    projects: Array.isArray(data.projects) ? (data.projects as WorkspaceProject[]) : [],
    totalProjects: Number.isFinite(data.totalProjects) ? Number(data.totalProjects) : 0,
    hero: (data.hero as WorkspaceHero | null | undefined) ?? null,
    quota: data.quota as WorkspaceQuota,
    tasks,
    generationTargets: Array.isArray(data.generationTargets)
      ? (data.generationTargets as WorkspaceGenerationTarget[])
      : [],
    videoCapabilities: data.videoCapabilities && typeof data.videoCapabilities === 'object'
      ? data.videoCapabilities as WorkspaceVideoCapabilities
      : demoWorkspace.videoCapabilities,
    videoTargets: Array.isArray(data.videoTargets)
      ? data.videoTargets as WorkspaceVideoTarget[]
      : [],
    videoReadiness: data.videoReadiness && typeof data.videoReadiness === 'object'
      ? data.videoReadiness as WorkspaceVideoReadiness
      : demoWorkspace.videoReadiness,
    batches: Array.isArray(data.batches) ? data.batches as WorkspaceBatch[] : [],
    agentMemory: data.agentMemory && typeof data.agentMemory === 'object'
      ? data.agentMemory as WorkspaceAgentMemory
      : demoWorkspace.agentMemory,
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
