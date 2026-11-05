import type { WorkspaceTaskStatus } from './workspace-api.ts';

export interface RecommendationCandidate {
  blockedReason?: string | null;
  latestTaskStatus?: WorkspaceTaskStatus | null;
}

/**
 * 手机首屏只推荐一个下一步。已有运行任务或缺少前置条件的候选先后退，
 * 但全部不可用时仍返回第一个，以便用户看到真实阻断原因。
 */
export function recommendedGenerationTarget<T extends RecommendationCandidate>(
  items: readonly T[],
): T | null {
  const ready = items.find((item) =>
    !item.blockedReason
    && item.latestTaskStatus !== 'queued'
    && item.latestTaskStatus !== 'running'
  );
  return ready ?? items[0] ?? null;
}
