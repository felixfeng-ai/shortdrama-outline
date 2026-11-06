import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createReviewComment,
  fetchProjectReviewComments,
  fetchReviewComments,
  markBestReviewComment,
  resolveReviewComment,
  timecodeLabel,
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
        kind: 'reject',
        timecodeMs: null,
        isBest: false,
        continuityStatus: 'not_checked',
        continuitySummary: '',
        continuityIssueCount: 0,
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
  assert.equal(comments[0].kind, 'reject');
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
        kind: 'reject',
        timecodeMs: null,
        isBest: false,
        continuityStatus: 'not_checked',
        continuitySummary: '',
        continuityIssueCount: 0,
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
    kind: 'reject',
    timecodeMs: null,
    frameMarked: false,
    isBest: false,
    continuityStatus: 'not_checked',
    continuitySummary: '',
    continuityIssueCount: 0,
  });
  assert.equal(comment.status, 'open');
});

test('视频时间码批注发送结构化时间码，并显示为分秒', async () => {
  let body: Record<string, unknown> | undefined;
  const fakeFetch = async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      success: true,
      error: null,
      data: { comment: {
        id: 'comment-time',
        projectId: 'p1',
        targetType: 'shot',
        targetId: 'shot-1',
        targetName: '第 1 镜',
        body: '眼神再停半拍',
        status: 'open',
        kind: 'timecode',
        timecodeMs: 5_400,
        frameMarked: true,
        isBest: false,
        continuityStatus: 'not_checked',
        continuitySummary: '',
        continuityIssueCount: 0,
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
    {
      targetType: 'shot',
      targetId: 'shot-1',
      body: '眼神再停半拍',
      kind: 'timecode',
      timecodeMs: 5_400,
      frameMarked: true,
    },
    fakeFetch as typeof fetch,
  );
  assert.equal(body?.kind, 'timecode');
  assert.equal(body?.timecodeMs, 5_400);
  assert.equal(body?.frameMarked, true);
  assert.equal(timecodeLabel(comment.timecodeMs), '00:05.4');
});

test('项目返修队列读取全部开放镜头批注', async () => {
  let url = '';
  const fakeFetch = async (input: string | URL | Request) => {
    url = String(input);
    return Response.json({
      success: true,
      error: null,
      data: { comments: [] },
    });
  };
  await fetchProjectReviewComments(
    'http://127.0.0.1:3200',
    'p1',
    fakeFetch as typeof fetch,
  );
  assert.equal(url, 'http://127.0.0.1:3200/api/projects/p1/comments');
});

test('现场 Take 可以设为唯一好镜', async () => {
  let body: Record<string, unknown> | undefined;
  const fakeFetch = async (_input: string | URL | Request, init?: RequestInit) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      success: true,
      error: null,
      data: { comment: {
        id: 'take-1',
        projectId: 'p1',
        targetType: 'shot',
        targetId: 'shot-1',
        targetName: '第 1 镜',
        body: '这一条最好',
        status: 'open',
        kind: 'take',
        timecodeMs: null,
        isBest: true,
        continuityStatus: 'passed',
        continuitySummary: '与 Canon 一致',
        continuityIssueCount: 0,
        authorId: 'user-1',
        createdAt: 1,
        updatedAt: 2,
        resolvedAt: null,
      } },
    });
  };
  const updated = await markBestReviewComment(
    'http://127.0.0.1:3200',
    'p1',
    'take-1',
    fakeFetch as typeof fetch,
  );
  assert.deepEqual(body, { isBest: true });
  assert.equal(updated.isBest, true);
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
        kind: 'reject',
        timecodeMs: null,
        isBest: false,
        continuityStatus: 'not_checked',
        continuitySummary: '',
        continuityIssueCount: 0,
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
