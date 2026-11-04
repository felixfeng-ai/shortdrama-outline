import assert from 'node:assert/strict';
import test from 'node:test';

import {
  APP_TABS,
  GENERATION_TASKS,
  PROJECTS,
  REVIEW_VERSIONS,
  activeProject,
  completionPercent,
  taskCountByState,
} from './app-data.ts';

test('native app exposes four unique destinations with Agent first', () => {
  assert.deepEqual(APP_TABS.map((tab) => tab.label), ['Agent', '项目', '任务', '我的']);
  assert.equal(new Set(APP_TABS.map((tab) => tab.key)).size, 4);
});

test('project progress is bounded and active project is present', () => {
  assert.equal(completionPercent({ completedSteps: 4 }), 67);
  assert.equal(completionPercent({ completedSteps: 9 }), 100);
  assert.equal(activeProject().id, PROJECTS[0].id);
});

test('review versions have one selected version', () => {
  assert.equal(REVIEW_VERSIONS.filter((version) => version.selected).length, 1);
});

test('task counts stay consistent with the visual prototype', () => {
  assert.equal(taskCountByState('needs-review'), 1);
  assert.equal(taskCountByState('running'), 1);
  assert.equal(taskCountByState('failed'), 1);
  assert.equal(GENERATION_TASKS.length, 3);
});

