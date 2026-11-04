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
