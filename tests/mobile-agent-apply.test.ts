import assert from 'node:assert/strict'
import test from 'node:test'

import { openDb } from '../lib/assets/db.ts'
import { createProject, createSnapshot, latestSnapshot } from '../lib/assets/repo.ts'
import {
  applyMobileShotEdit,
  applyShotEdit,
  readMobileShotEdit,
} from '../lib/mobile-agent-apply.ts'

const shots = [
  {
    id: 'shot-1',
    entityId: 'entity-1',
    shot: 1,
    episode: 1,
    scene: '别墅门外',
    characters: ['陈默'],
    action: '陈默站在门外。',
    speaker: '',
    dialogue: '',
    place: '别墅门外',
    shotSize: '中景',
    camera: '固定',
    prompt: 'CHEN MO outside a villa, cinematic, 9:16',
    refImages: ['陈默·正面'],
    missingRefFor: [],
    params: { ratio: '9:16', duration: 10, lastFrame: false },
    status: 'done',
  },
  {
    id: 'shot-2',
    entityId: 'entity-2',
    shot: 2,
    episode: 1,
    scene: '别墅门外',
    characters: ['陈默'],
    action: '陈默敲门。',
    speaker: '',
    dialogue: '',
    place: '别墅门外',
    shotSize: '近景',
    camera: '推',
    prompt: 'CHEN MO knocks on the door, close-up',
    refImages: [],
    missingRefFor: ['陈默'],
    params: { ratio: '9:16', duration: 5, lastFrame: true },
    status: 'todo',
  },
]

test('shot edit changes only the target field and target shot', () => {
  const edit = readMobileShotEdit({
    shot: 1,
    target: 'action',
    text: '陈默停步，没有立刻敲门。',
    summary: '先停一拍',
  })
  const result = applyShotEdit(shots, edit)

  assert.equal(result.shots[0].action, '陈默停步，没有立刻敲门。')
  assert.equal(result.shots[0].prompt, shots[0].prompt)
  assert.deepEqual(result.shots[1], shots[1])
  assert.equal(result.shot.shot, 1)
})

test('shot edit input rejects missing shots, invalid targets and oversized text', () => {
  assert.throws(
    () => readMobileShotEdit({ shot: 0, target: 'action', text: 'x' }),
    /不存在/,
  )
  assert.throws(
    () => readMobileShotEdit({ shot: 1, target: 'everything', text: 'x' }),
    /只能是/,
  )
  assert.throws(
    () => readMobileShotEdit({ shot: 1, target: 'action', text: '长'.repeat(2001) }),
    /过长/,
  )
  assert.throws(
    () => applyShotEdit({ nope: true }, readMobileShotEdit({ shot: 1, target: 'action', text: 'x' })),
    /分镜数据/,
  )
  assert.throws(
    () =>
      applyShotEdit(
        [shots[0], null],
        readMobileShotEdit({ shot: 1, target: 'action', text: 'x' }),
      ),
    /无法识别/,
  )
})

test('mobile writeback creates a new shots snapshot with the current version', () => {
  const db = openDb(':memory:')
  try {
    const project = createProject(db, '快递员', 'owner')
    const base = createSnapshot(db, { projectId: project.id, kind: 'shots', payload: shots })
    const result = applyMobileShotEdit(db, {
      projectId: project.id,
      baseSnapshotId: base.id,
      edit: readMobileShotEdit({
        shot: 1,
        target: 'action',
        text: '陈默停步，没有立刻敲门。',
        summary: '先停一拍',
      }),
    })

    assert.equal(result.snapshot.version, 2)
    assert.equal(result.snapshot.id, latestSnapshot(db, project.id, 'shots')?.id)
    const payload = result.snapshot.payload as typeof shots
    assert.equal(payload[0].action, '陈默停步，没有立刻敲门。')
    assert.equal(payload[1].action, shots[1].action)
  } finally {
    db.close()
  }
})

test('mobile writeback rejects a stale base snapshot instead of overwriting it', () => {
  const db = openDb(':memory:')
  try {
    const project = createProject(db, '快递员', 'owner')
    const base = createSnapshot(db, { projectId: project.id, kind: 'shots', payload: shots })
    createSnapshot(db, { projectId: project.id, kind: 'shots', payload: shots })

    assert.throws(
      () =>
        applyMobileShotEdit(db, {
          projectId: project.id,
          baseSnapshotId: base.id,
          edit: readMobileShotEdit({ shot: 1, target: 'action', text: '新动作' }),
        }),
      (error: unknown) =>
        error instanceof Error &&
        'status' in error &&
        (error as Error & { status: number }).status === 409,
    )
  } finally {
    db.close()
  }
})
