import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorkspaceProject,
  deleteWorkspaceProject,
  importWorkspaceProject,
  loadSampleWorkspaceProject,
  renameWorkspaceProject,
  validateProjectTitle,
} from './project-api.ts';

function envelope(data: unknown) {
  return new Response(JSON.stringify({ success: true, data, error: null }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('project title is trimmed and bounded before creating', () => {
  assert.equal(validateProjectTitle('  夜港来信  '), '夜港来信');
  assert.throws(() => validateProjectTitle(''), /项目名/);
  assert.throws(() => validateProjectTitle('长'.repeat(101)), /100/);
});

test('create project posts to the shared projects endpoint', async () => {
  let url = '';
  let init: RequestInit | undefined;
  const fakeFetch = async (input: string | URL | Request, options?: RequestInit) => {
    url = String(input);
    init = options;
    return envelope({
      project: { id: 'p1', title: '夜港来信', ownerId: 'u1', createdAt: 1, updatedAt: 2 },
    });
  };

  const project = await createWorkspaceProject(
    'http://127.0.0.1:3200/',
    '  夜港来信 ',
    fakeFetch as typeof fetch,
  );

  assert.equal(url, 'http://127.0.0.1:3200/api/projects');
  assert.equal(project.id, 'p1');
  assert.deepEqual(JSON.parse(String(init?.body)), { title: '夜港来信' });
});

test('sample and package import use the same Web endpoints', async () => {
  const urls: string[] = [];
  const fakeFetch = async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/api/project-import')) {
      return envelope({
        project: { id: 'p2', title: '导入项目', createdAt: 1, updatedAt: 2 },
        counts: { snapshots: 8, tasks: 0, keyframes: 0, refs: 0 },
        warnings: [],
      });
    }
    return envelope({
      project: { id: 'p3', title: '示例', createdAt: 1, updatedAt: 2 },
    });
  };

  await loadSampleWorkspaceProject('http://127.0.0.1:3200', fakeFetch as typeof fetch);
  const result = await importWorkspaceProject(
    'http://127.0.0.1:3200',
    new FormData(),
    fakeFetch as typeof fetch,
  );

  assert.equal(urls[0], 'http://127.0.0.1:3200/api/sample');
  assert.equal(urls[1], 'http://127.0.0.1:3200/api/project-import');
  assert.equal(result.project.id, 'p2');
});

test('project rename and delete reuse shared project API', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return envelope(init?.method === 'DELETE'
      ? { id: 'p1' }
      : { project: { id: 'p1', title: '新名字', createdAt: 1, updatedAt: 2 } });
  };
  const renamed = await renameWorkspaceProject(
    'http://127.0.0.1:3200',
    'p1',
    ' 新名字 ',
    fakeFetch as typeof fetch,
  );
  assert.equal(renamed.title, '新名字');
  assert.equal(calls[0].init?.method, 'PATCH');
  await deleteWorkspaceProject('http://127.0.0.1:3200', 'p1', fakeFetch as typeof fetch);
  assert.match(calls[1].url, /id=p1/);
  assert.equal(calls[1].init?.method, 'DELETE');
});
