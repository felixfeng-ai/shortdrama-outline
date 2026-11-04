import assert from 'node:assert/strict'
import test from 'node:test'

import { buildMobileContext } from '../lib/mobile-context.ts'
import type { Project } from '../lib/assets/repo.ts'

const projects: Project[] = [
  {
    id: 'project-new',
    title: '夜港来信',
    ownerId: 'owner',
    createdAt: 1,
    updatedAt: 1_000,
  },
  {
    id: 'project-old',
    title: '雾中来客',
    ownerId: 'owner',
    createdAt: 1,
    updatedAt: 500,
  },
]

const quota = {
  remaining: 18,
  limit: 60,
  used: 42,
  projectsLeft: 1,
}

test('mobile context returns real project, latest scene and shot summary', () => {
  const context = buildMobileContext({
    projects,
    quota,
    now: 10_000,
    snapshots: {
      characters: [{ name: '林昭' }],
      acts: [{ title: '第一幕' }],
      episodes: [
        { number: 1, title: '第一集' },
        { number: 3, title: '潮汐之后' },
      ],
      visualCharacters: [{ name: '林昭' }],
      scenes: [
        { number: 11, episode: 2, location: '旧码头', timeOfDay: '夜外', summary: '旧场次' },
        { number: 12, episode: 3, location: '码头夜谈', timeOfDay: '夜外', summary: '林昭把信递出去' },
      ],
      shots: [
        { shot: 16, episode: 3, scene: '码头夜谈', action: '林昭犹豫' },
        { shot: 17, episode: 3, scene: '码头夜谈', action: '林昭递信', params: { duration: 10 } },
      ],
    },
  })

  assert.equal(context.activeProject?.id, 'project-new')
  assert.equal(context.activeProject?.title, '夜港来信')
  assert.equal(context.activeProject?.completedSteps, 6)
  assert.equal(context.hero?.episodeNumber, 3)
  assert.equal(context.hero?.episodeTitle, '潮汐之后')
  assert.equal(context.hero?.sceneNumber, 12)
  assert.equal(context.hero?.sceneLocation, '码头夜谈')
  assert.equal(context.hero?.shotNumber, 17)
  assert.equal(context.hero?.shotCount, 2)
  assert.match(context.hero?.evidence ?? '', /2 个镜头/)
  assert.equal(context.projects[1].hasDetails, false)
  assert.equal(context.totalProjects, 2)
  assert.equal(context.quota.remaining, 18)
})

test('mobile context handles an empty workspace without inventing a project', () => {
  const context = buildMobileContext({ projects: [], quota, now: 10_000, snapshots: {} })

  assert.equal(context.activeProject, null)
  assert.equal(context.hero, null)
  assert.deepEqual(context.projects, [])
  assert.equal(context.totalProjects, 0)
  assert.equal(context.quota.limit, 60)
})

test('mobile context tolerates missing or malformed snapshot payloads', () => {
  const context = buildMobileContext({
    projects: [projects[0]],
    quota,
    now: 10_000,
    snapshots: {
      episodes: null,
      scenes: { unexpected: true },
      shots: 'not-an-array',
    },
  })

  assert.equal(context.activeProject?.completedSteps, 0)
  assert.equal(context.hero, null)
  assert.equal(context.activeProject?.shotCount, 0)
})

test('mobile context formats recent updates without leaking owner identity', () => {
  const context = buildMobileContext({ projects, quota, now: 61_000, snapshots: {} })

  assert.equal(context.projects[0].updatedLabel, '1 分钟前')
  assert.equal('ownerId' in context.projects[0], false)
})
