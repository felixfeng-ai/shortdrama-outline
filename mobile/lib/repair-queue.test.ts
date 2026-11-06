import assert from 'node:assert/strict';
import test from 'node:test';

import type { ReviewComment } from './review-comments-api.ts';
import {
  repairQueueCounts,
  repairQueueItems,
} from './repair-queue.ts';

function comment(over: Partial<ReviewComment>): ReviewComment {
  return {
    id: 'comment-1',
    projectId: 'p1',
    targetType: 'shot',
    targetId: 'shot-1',
    targetName: '第 1 镜',
    body: '需要返修',
    status: 'open',
    kind: 'reject',
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

test('返修队列只包含开放镜头记录', () => {
  const comments = [
    comment({ id: 'repair' }),
    comment({ id: 'final', kind: 'final' }),
    comment({ id: 'resolved', status: 'resolved' }),
    comment({ id: 'character', targetType: 'character' }),
    comment({ id: 'comment', kind: 'comment' }),
  ];
  assert.deepEqual(repairQueueItems(comments, 'repair').map((item) => item.id), ['repair']);
  assert.deepEqual(repairQueueItems(comments, 'final').map((item) => item.id), ['final']);
});

test('返修队列分别统计待返修与待定稿', () => {
  const counts = repairQueueCounts([
    comment({ id: 'repair-1' }),
    comment({ id: 'repair-2' }),
    comment({ id: 'final-1', kind: 'final' }),
    comment({ id: 'resolved', status: 'resolved' }),
  ]);
  assert.deepEqual(counts, { repair: 2, final: 1 });
});
