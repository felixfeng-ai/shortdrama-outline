import type { ContinuityContext } from './vision.ts'

type SnapshotPayloads = {
  visualCharacters?: unknown
  visualPlaces?: unknown
  shots?: unknown
}

type CanonLike = {
  entityName?: unknown
  field?: unknown
  value?: unknown
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : []
}

function text(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function numbers(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item, 80)).filter(Boolean)
    : []
}

export function buildContinuityContext(input: {
  projectTitle: string
  targetId: string
  snapshots: SnapshotPayloads
  canon?: readonly CanonLike[]
}): ContinuityContext {
  const shot = records(input.snapshots.shots).find((item) =>
    text(item.entityId) === input.targetId || text(item.id) === input.targetId
  )
  if (!shot) throw new Error('当前镜头还没有保存到项目')

  const scene = text(shot.scene)
  const placeName = text(shot.place) || scene
  const characterNames = new Set(numbers(shot.characters))
  const characters = records(input.snapshots.visualCharacters)
    .filter((item) => characterNames.has(text(item.name)))
    .map((item) => ({
      name: text(item.name),
      wardrobe: text(item.wardrobe),
      marks: text(item.marks),
      anchor: text(item.anchor, 1_000),
    }))
    .filter((item) => item.name)
  const places = records(input.snapshots.visualPlaces)
    .filter((item) => text(item.name) === placeName)
    .map((item) => ({
      name: text(item.name),
      space: text(item.space),
      props: text(item.props),
      lighting: text(item.lighting),
      anchor: text(item.anchor, 1_000),
    }))
    .filter((item) => item.name)
  const relevantEntities = new Set([
    ...characters.map((item) => item.name),
    ...places.map((item) => item.name),
  ])
  const canon = (input.canon ?? [])
    .map((item) => {
      const entityName = text(item.entityName, 120)
      if (!relevantEntities.has(entityName)) return ''
      const field = text(item.field, 100)
      const value = text(item.value, 500)
      return entityName && field && value ? `${entityName}｜${field}：${value}` : ''
    })
    .filter(Boolean)
    .slice(0, 20)

  const episode = Number(shot.episode)
  const shotNumber = Number(shot.shot)
  return {
    projectTitle: input.projectTitle,
    shotLabel: [
      episode > 0 ? `第 ${episode} 集` : '',
      shotNumber > 0 ? `第 ${shotNumber} 镜` : '',
      scene || '未命名场景',
    ].filter(Boolean).join(' · '),
    shotPrompt: text(shot.prompt, 7_000),
    characters,
    places,
    canon,
  }
}
