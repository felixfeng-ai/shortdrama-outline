import assert from 'node:assert/strict';
import test from 'node:test';

import { createProjectReviewLink } from './share-api.ts';

test('只读审阅链接使用共享项目并生成绝对地址', async () => {
  let init: RequestInit | undefined;
  const fakeFetch = async (_input: string | URL | Request, options?: RequestInit) => {
    init = options;
    return Response.json({
      success: true,
      error: null,
      data: {
        share: {
          id: 'share-1',
          token: 'token',
          path: '/share/token',
          expiresAt: 123,
        },
      },
    });
  };
  const result = await createProjectReviewLink(
    'http://127.0.0.1:3200/',
    'project-1',
    fakeFetch as typeof fetch,
  );
  assert.equal(result.url, 'http://127.0.0.1:3200/share/token');
  assert.equal(init?.method, 'POST');
});
