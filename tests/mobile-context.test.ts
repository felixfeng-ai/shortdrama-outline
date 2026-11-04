import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMobileContext } from '../lib/mobile-context.ts'

const quota = { remaining: 20, limit: 65, used: 45, projectsLeft: 1 }
const projects = [
  {
    id: 'p1',
    title: '项目一',
    ownerId: 'u1',
    createdAt: 1,
    updatedAt: 1000,
  },
  {
    id: 'p2',
    title: '项目二',
    ownerId: 'u1',
    createdAt: 2,
    updatedAt: 2000,
  },
]

const generationTasks = [
  {
    id: 'task-1',
    projectId: 'p2',
    targetType: 'shot' as const,
    targetId: 'shot-entity-17',
    providerId: 'aliyun',
    model: 'wanx2.1-t2i-turbo',
    prompt: '雨夜码头',
    promptHash: 'hash',
    status: 'failed' as const,
    error: 'Provider 超时',
    assetId: null,
    createdAt: 2100,
    startedAt: 2200,
    finishedAt: 2500,
  },
  {
    id: 'task-other-project',
    projectId: 'p1',
    targetType: 'character' as const,
    targetId: 'char-other',
    providerId: 'aliyun',
    model: 'wanx2.1-t2i-turbo',
    prompt: 'other project',
    promptHash: 'hash-2',
    status: 'succeeded' as const,
    error: null,
    assetId: 'asset-other',
    createdAt: 2000,
    startedAt: 2050,
    finishedAt: 2200,
  },
]

test('mobile context promotes the explicitly selected project', () => {
  const context = buildMobileContext({
    projects,
    snapshots: {},
    quota,
    now: 3000,
    activeProjectId: 'p2',
  })

  assert.equal(context.activeProject?.id, 'p2')
  assert.equal(context.projects[0].id, 'p2')
  assert.equal(context.projects[1].id, 'p1')
  assert.equal(context.totalProjects, 2)
})

test('mobile context falls back to the most recent project without a selection', () => {
  const context = buildMobileContext({
    projects,
    snapshots: {},
    quota,
    now: 3000,
  })

  assert.equal(context.activeProject?.id, 'p1')
})

test('mobile context returns real generation tasks with readable project targets', () => {
  const context = buildMobileContext({
    projects,
    snapshots: {
      shots: [
        {
          id: 'shot-17',
          entityId: 'shot-entity-17',
          episode: 3,
          shot: 17,
          scene: '码头夜谈',
          characters: [],
          action: '',
          speaker: '',
          dialogue: '',
          place: '码头夜谈',
          shotSize: '近景',
          camera: '固定',
          prompt: '',
          refImages: [],
          missingRefFor: [],
          params: { ratio: '9:16', duration: 10, lastFrame: false },
          status: 'todo',
        },
      ],
    },
    quota,
    now: 3000,
    activeProjectId: 'p2',
    tasks: generationTasks,
  })

  assert.equal(context.tasks.length, 1)
  assert.equal(context.tasks[0].id, 'task-1')
  assert.equal(context.tasks[0].targetLabel, '第 3 集 · 第 17 镜 · 码头夜谈')
  assert.equal(context.tasks[0].status, 'failed')
  assert.equal(context.tasks[0].error, 'Provider 超时')
})
