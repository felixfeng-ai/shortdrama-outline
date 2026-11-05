import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createReviewComment,
  fetchReviewComments,
  resolveReviewComment,
} from './review-comments-api.ts';

test('镜头批注按项目与稳定镜头 ID 读取', async () => {
  let url = '';
  const fakeFetch = async (input: string | URL | Request) => {
    url = String(input);
    return Response.json({
      success: true,
      error: null,
      data: { comments: [{
        id: 'comment-1',
        projectId: 'p1',
        targetType: 'shot',
        targetId: 'shot-1',
        targetName: '第 1 镜',
        body: '退回：门口太亮',
        status: 'open',
        authorId: 'user-1',
        createdAt: 1,
        updatedAt: 1,
        resolvedAt: null,
      }] },
    });
  };

  const comments = await fetchReviewComments(
    'http://127.0.0.1:3200',
    'p1',
    'shot-1',
    fakeFetch as typeof fetch,
  );
  assert.match(url, /\/api\/projects\/p1\/comments\?targetType=shot&targetId=shot-1/);
  assert.equal(comments[0].body, '退回：门口太亮');
});

test('退回原因作为镜头批注创建，不伪造采用状态', async () => {
  let body: Record<string, unknown> | undefined;
  const fakeFetch = async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      success: true,
      error: null,
      data: { comment: {
        id: 'comment-2',
        projectId: 'p1',
        targetType: 'shot',
        targetId: 'shot-1',
        targetName: '第 1 镜',
        body: '【退回】门口太亮',
        status: 'open',
        authorId: 'user-1',
        createdAt: 1,
        updatedAt: 1,
        resolvedAt: null,
      } },
    });
  };

  const comment = await createReviewComment(
    'http://127.0.0.1:3200',
    'p1',
    { targetType: 'shot', targetId: 'shot-1', body: '门口太亮', kind: 'reject' },
    fakeFetch as typeof fetch,
  );
  assert.deepEqual(body, {
    targetType: 'shot',
    targetId: 'shot-1',
    body: '【退回】门口太亮',
  });
  assert.equal(comment.status, 'open');
});

test('批注可以标记已处理', async () => {
  let method = '';
  const fakeFetch = async (_input: string | URL | Request, init?: RequestInit) => {
    method = String(init?.method);
    return Response.json({
      success: true,
      error: null,
      data: { comment: {
        id: 'comment-1',
        projectId: 'p1',
        targetType: 'shot',
        targetId: 'shot-1',
        targetName: '第 1 镜',
        body: '门口太亮',
        status: 'resolved',
        authorId: 'user-1',
        createdAt: 1,
        updatedAt: 2,
        resolvedAt: 2,
      } },
    });
  };
  const comment = await resolveReviewComment(
    'http://127.0.0.1:3200',
    'p1',
    'comment-1',
    fakeFetch as typeof fetch,
  );
  assert.equal(method, 'PATCH');
  assert.equal(comment.status, 'resolved');
});
