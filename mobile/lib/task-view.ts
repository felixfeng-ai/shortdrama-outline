import type { WorkspaceTask, WorkspaceTaskStatus } from './workspace-api.ts';

export type TaskFilter = 'all' | 'active' | 'done' | 'failed';

export interface TaskCounts {
  total: number;
  active: number;
  done: number;
  failed: number;
}

const STATUS_LABELS: Record<WorkspaceTaskStatus, string> = {
  queued: '等待中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  canceled: '已停止',
};

export function taskStatusLabel(status: WorkspaceTaskStatus): string {
  return STATUS_LABELS[status];
}

export function hasActiveTasks(tasks: readonly WorkspaceTask[]): boolean {
  return tasks.some((task) => task.status === 'queued' || task.status === 'running');
}

export function taskCounts(tasks: readonly WorkspaceTask[]): TaskCounts {
  return {
    total: tasks.length,
    active: tasks.filter((task) => task.status === 'queued' || task.status === 'running').length,
    done: tasks.filter((task) => task.status === 'succeeded').length,
    failed: tasks.filter((task) => task.status === 'failed' || task.status === 'canceled').length,
  };
}

export function filterWorkspaceTasks(
  tasks: readonly WorkspaceTask[],
  filter: TaskFilter,
): WorkspaceTask[] {
  if (filter === 'active') {
    return tasks.filter((task) => task.status === 'queued' || task.status === 'running');
  }
  if (filter === 'done') return tasks.filter((task) => task.status === 'succeeded');
  if (filter === 'failed') {
    return tasks.filter((task) => task.status === 'failed' || task.status === 'canceled');
  }
  return [...tasks];
}

export function taskCreatedLabel(createdAt: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - createdAt);
  if (elapsed < 60_000) return '刚刚';
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`;
  const date = new Date(createdAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function taskDurationLabel(task: WorkspaceTask, now = Date.now()): string {
  if (task.status === 'queued' || !task.startedAt) return '--';
  const end = task.finishedAt ?? (task.status === 'running' ? now : null);
  if (!end) return '--';
  return formatDuration(end - task.startedAt);
}

export function safeTaskError(error: string | null): string {
  if (!error) return '';
  return /api[- ]?key|access.?key|unauthorized|invalid.?token/i.test(error)
    ? '平台服务异常，请稍后重试'
    : error;
}
