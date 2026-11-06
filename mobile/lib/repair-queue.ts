import type { ReviewComment } from './review-comments-api.ts';

export type RepairQueueFilter = 'repair' | 'final';

export function repairQueueItems(
  comments: readonly ReviewComment[],
  filter: RepairQueueFilter,
): ReviewComment[] {
  const kind = filter === 'repair' ? 'reject' : 'final';
  return comments
    .filter((comment) =>
      comment.status === 'open'
      && comment.targetType === 'shot'
      && comment.kind === kind,
    )
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function repairQueueCounts(
  comments: readonly ReviewComment[],
): Record<RepairQueueFilter, number> {
  return {
    repair: repairQueueItems(comments, 'repair').length,
    final: repairQueueItems(comments, 'final').length,
  };
}
