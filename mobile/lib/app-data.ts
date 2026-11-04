export type AppTabKey = 'agent' | 'projects' | 'tasks' | 'me';
export type TaskState = 'needs-review' | 'running' | 'done' | 'failed';

export interface ProjectSummary {
  id: string;
  title: string;
  episode: string;
  step: string;
  completedSteps: number;
  pendingCount: number;
  shotCount: number;
  updatedLabel: string;
  status: 'active' | 'draft' | 'complete';
}

export interface ReviewVersion {
  id: string;
  label: string;
  source: string;
  selected: boolean;
}

export interface GenerationTaskSummary {
  id: string;
  title: string;
  target: string;
  state: TaskState;
  cost: string;
  elapsed: string;
}

export const APP_TABS: ReadonlyArray<{ key: AppTabKey; label: string }> = [
  { key: 'agent', label: 'Agent' },
  { key: 'projects', label: '项目' },
  { key: 'tasks', label: '任务' },
  { key: 'me', label: '我的' },
];

export const PROJECTS: ReadonlyArray<ProjectSummary> = [
  {
    id: 'night-harbor',
    title: '夜港来信',
    episode: '第 3 集',
    step: '分镜',
    completedSteps: 4,
    pendingCount: 2,
    shotCount: 24,
    updatedLabel: '刚刚更新',
    status: 'active',
  },
  {
    id: 'mist-visitor',
    title: '雾中来客',
    episode: '第 7 集',
    step: '定妆',
    completedSteps: 3,
    pendingCount: 1,
    shotCount: 36,
    updatedLabel: '昨天 22:14',
    status: 'draft',
  },
  {
    id: 'last-callback',
    title: '第十三次回拨',
    episode: '第 12 集',
    step: '已完成',
    completedSteps: 6,
    pendingCount: 0,
    shotCount: 58,
    updatedLabel: '10 月 21 日',
    status: 'complete',
  },
];

export const REVIEW_VERSIONS: ReadonlyArray<ReviewVersion> = [
  { id: 'v3', label: 'V3', source: '导演版 · 21:08', selected: true },
  { id: 'v2', label: 'V2', source: '角色版 · 20:42', selected: false },
  { id: 'v1', label: 'V1', source: '首版 · 20:18', selected: false },
];

export const GENERATION_TASKS: ReadonlyArray<GenerationTaskSummary> = [
  {
    id: 'shot-17',
    title: '第 17 镜首帧',
    target: '雨夜码头 · 近景',
    state: 'needs-review',
    cost: '¥0.42',
    elapsed: '00:48',
  },
  {
    id: 'shot-18',
    title: '第 18 镜首帧',
    target: '码头远景 · 全景',
    state: 'running',
    cost: '¥0.31',
    elapsed: '00:21',
  },
  {
    id: 'character-suwan',
    title: '苏婉定妆图',
    target: '侧脸近景 · 雨夜',
    state: 'failed',
    cost: '¥0.00',
    elapsed: '--',
  },
];

export const AGENT_STEPS = [
  '读取当前项目镜头',
  '比对角色锚点与视觉宪法',
  '检查当前镜首帧缺口',
] as const;

export function completionPercent(project: Pick<ProjectSummary, 'completedSteps'>): number {
  return Math.round((Math.max(0, Math.min(6, project.completedSteps)) / 6) * 100);
}

export function activeProject(): ProjectSummary {
  return PROJECTS[0];
}

export function taskCountByState(state: TaskState): number {
  return GENERATION_TASKS.filter((task) => task.state === state).length;
}

