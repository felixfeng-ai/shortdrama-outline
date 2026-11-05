import type { WorkspaceTask } from './workspace-api.ts';

export interface TaskGroup {
  kind: 'single' | 'batch';
  id: string;
  tasks: WorkspaceTask[];
  reviewable: number;
  active: number;
  failed: number;
  completed: number;
}

/**
 * 批次是任务中心的第一层账本：同批次单镜不应在手机上铺成一长串独立卡片。
 * 分组只改变展示，不合并、不改写服务端任务。
 */
export function groupWorkspaceTasks(tasks: readonly WorkspaceTask[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  const ordered: TaskGroup[] = [];
  for (const task of tasks) {
    const id = task.batchId ? `batch:${task.batchId}` : `task:${task.id}`;
    let group = groups.get(id);
    if (!group) {
      group = {
        kind: task.batchId ? 'batch' : 'single',
        id,
        tasks: [],
        reviewable: 0,
        active: 0,
        failed: 0,
        completed: 0,
      };
      groups.set(id, group);
      ordered.push(group);
    }
    group.tasks.push(task);
  }
  return ordered.map((group) => ({
    ...group,
    reviewable: group.tasks.filter((task) =>
      task.status === 'succeeded' && Boolean(task.assetId)
    ).length,
    active: group.tasks.filter((task) =>
      task.status === 'queued' || task.status === 'running'
    ).length,
    failed: group.tasks.filter((task) =>
      task.status === 'failed' || task.status === 'canceled'
    ).length,
    completed: group.tasks.filter((task) => task.status === 'succeeded').length,
  }));
}
