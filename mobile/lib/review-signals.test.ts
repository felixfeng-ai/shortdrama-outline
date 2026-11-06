import assert from 'node:assert/strict';
import test from 'node:test';

import type { ReviewComment } from './review-comments-api.ts';
import {
  reviewAspectCheck,
  reviewDecisionState,
  reviewSubtitleTrackState,
} from './review-signals.ts';

function comment(over: Partial<ReviewComment>): ReviewComment {
  return {
    id: 'comment-1',
    projectId: 'p1',
    targetType: 'shot',
    targetId: 'shot-1',
    targetName: '第 1 镜',
    body: '问题',
    status: 'open',
    kind: 'comment',
    timecodeMs: null,
    frameMarked: false,
    isBest: false,
    continuityStatus: 'not_checked',
    continuitySummary: '',
    continuityIssueCount: 0,
    authorId: 'user-1',
    createdAt: 1,
    updatedAt: 1,
    resolvedAt: null,
    ...over,
  };
}

test('画幅检查使用真实宽高并识别竖屏镜头不匹配', () => {
  assert.equal(reviewAspectCheck(1080, 1920, 'shot').status, 'match');
  assert.equal(reviewAspectCheck(1080, 1920, 'shot').label, '1080 × 1920 · 9:16');
  assert.equal(reviewAspectCheck(1920, 1080, 'shot').status, 'mismatch');
  assert.equal(reviewAspectCheck(null, null, 'shot').status, 'unknown');
  assert.equal(reviewAspectCheck(null, null, 'shot').label, '尺寸未记录');
});

test('镜头确认状态按退回、定稿、采用依次收敛', () => {
  assert.equal(reviewDecisionState([], null).label, '待确认');
  assert.equal(reviewDecisionState([], 100).label, '已通过');
  assert.equal(
    reviewDecisionState([comment({ kind: 'final', body: '【定稿】通过' })], 100).label,
    '已定稿',
  );
  assert.equal(
    reviewDecisionState([
      comment({ kind: 'final', body: '【定稿】通过' }),
      comment({ id: 'reject', kind: 'reject', body: '【退回】门口太亮' }),
    ], 100).label,
    '返修中',
  );
  assert.equal(
    reviewDecisionState([comment({ kind: 'reject', status: 'resolved' })], 100).label,
    '已通过',
  );
});

test('字幕轨只报告实际检测数量，不冒充字幕内容审核', () => {
  assert.equal(reviewSubtitleTrackState(0).label, '未检测到内嵌字幕轨');
  assert.equal(reviewSubtitleTrackState(2).label, '检测到 2 条内嵌字幕轨');
});
