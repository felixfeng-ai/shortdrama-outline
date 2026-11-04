import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildProjectImportForm,
  readManifestFromEntries,
} from './project-package.ts';

const manifest = {
  schema: 'chengju-project',
  schemaVersion: 1,
  mode: 'backup',
  project: { title: '导入测试' },
  projectSettings: { brief: {}, look: {}, episodeCount: 3 },
  story: { idea: '', characters: [], acts: [], episodes: [] },
  assets: { visuals: [], scenes: [], places: [], shots: [] },
  refs: [],
  keyframes: [
    {
      targetType: 'shot',
      targetId: 'shot-1',
      included: true,
      importFile: 'generated-0',
      archivePath: 'keyframes/shot-1.png',
    },
  ],
  tasks: [],
  snapshots: [],
  files: [],
  warnings: [],
};

test('manifest is read from the project ZIP entries', () => {
  const entries = new Map<string, Uint8Array>([
    ['manifest.json', new TextEncoder().encode(JSON.stringify(manifest))],
  ]);

  const result = readManifestFromEntries(entries);

  assert.equal(result.project.title, '导入测试');
  assert.equal(result.keyframes.length, 1);
});

test('import form uploads manifest and referenced keyframe bytes', async () => {
  const entries = new Map<string, Uint8Array>([
    ['manifest.json', new TextEncoder().encode(JSON.stringify(manifest))],
    ['keyframes/shot-1.png', new Uint8Array([1, 2, 3])],
  ]);

  const form = buildProjectImportForm(entries);
  const rawManifest = form.get('manifest');
  const file = form.get('generated-0');

  assert.equal(typeof rawManifest, 'string');
  assert.equal(JSON.parse(String(rawManifest)).project.title, '导入测试');
  assert.ok(file instanceof Blob);
  assert.equal(file.size, 3);
});
