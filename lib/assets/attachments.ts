// 图台账 → 工作台挂图状态。
//
// 服务端只保存 ownerType / ownerId / vaultKey；刷新后要把它们还原成
// 「角色名 -> 本地图 key」与「地点名 -> 本地图 key」两组界面状态。

export interface AttachmentRef {
  ownerType: string
  ownerId: string
  vaultKey: string
}

export interface AttachmentGroups {
  characters: Record<string, string[]>
  places: Record<string, string[]>
}

function pushUnique(
  groups: Record<string, string[]>,
  ownerId: string,
  vaultKey: string,
) {
  const owner = ownerId.trim()
  const key = vaultKey.trim()
  if (!owner || !key) return
  const list = groups[owner] ?? []
  if (!list.includes(key)) list.push(key)
  groups[owner] = list
}

export function groupAttachments(refs: readonly AttachmentRef[]): AttachmentGroups {
  const characters: Record<string, string[]> = {}
  const places: Record<string, string[]> = {}
  for (const ref of refs) {
    if (ref.ownerType === "character") pushUnique(characters, ref.ownerId, ref.vaultKey)
    else if (ref.ownerType === "place") pushUnique(places, ref.ownerId, ref.vaultKey)
  }
  return { characters, places }
}
