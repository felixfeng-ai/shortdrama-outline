import type { ReviewComment } from './review-comments-api.ts';
import { reviewAspectRatio } from './review-view.ts';
import type { WorkspaceTaskTargetType } from './workspace-api.ts';

export interface ReviewAspectCheck {
  status: 'match' | 'mismatch' | 'unknown';
  label: string;
  expected: string;
}

export interface ReviewDecisionState {
  label: '待确认' | '返修中' | '已通过' | '已定稿';
  tone: 'neutral' | 'warning' | 'success' | 'info';
}

function ratioLabel(value: number): string {
  const candidates = [
    { ratio: 9 / 16, label: '9:16' },
    { ratio: 16 / 9, label: '16:9' },
    { ratio: 3 / 4, label: '3:4' },
    { ratio: 4 / 3, label: '4:3' },
  ];
  return candidates.reduce((best, item) =>
    Math.abs(item.ratio - value) < Math.abs(best.ratio - value) ? item : best,
  ).label;
}

export function reviewAspectCheck(
  width: number | null,
  height: number | null,
  targetType: WorkspaceTaskTargetType,
): ReviewAspectCheck {
  const expectedRatio = reviewAspectRatio(targetType);
  const expected = ratioLabel(expectedRatio);
  if (!width || !height || width <= 0 || height <= 0) {
    return { status: 'unknown', label: '尺寸未记录', expected };
  }
  const actual = width / height;
  const actualLabel = ratioLabel(actual);
  return {
    status: Math.abs(actual - expectedRatio) <= 0.035 ? 'match' : 'mismatch',
    label: `${width} × ${height} · ${actualLabel}`,
    expected,
  };
}

export function reviewDecisionState(
  comments: readonly ReviewComment[],
  selectedAt: number | null,
): ReviewDecisionState {
  const openShots = comments.filter((comment) =>
    comment.status === 'open' && (comment.kind === 'reject' || comment.kind === 'final'),
  );
  if (openShots.some((comment) => comment.kind === 'reject')) {
    return { label: '返修中', tone: 'warning' };
  }
  if (openShots.some((comment) => comment.kind === 'final')) {
    return { label: '已定稿', tone: 'info' };
  }
  if (selectedAt) return { label: '已通过', tone: 'success' };
  return { label: '待确认', tone: 'neutral' };
}

export function reviewSubtitleTrackState(count: number): { label: string; hasTrack: boolean } {
  if (!Number.isFinite(count) || count <= 0) {
    return { label: '未检测到内嵌字幕轨', hasTrack: false };
  }
  return {
    label: `检测到 ${Math.floor(count)} 条内嵌字幕轨`,
    hasTrack: true,
  };
}
