// 「改一处，影响多少」的口径：拿当前这一版分镜，去对当前这一版定妆。
//
// 为什么单独抽出来：这段逻辑原本写在 page.tsx 里，没有测试兜着，于是注释说的和
// 代码做的不是一回事——注释写着「数提示词与当前锚点对不上的镜头」，代码数的却是
// 「还没做完的镜头」。结果界面上那句「N 个镜头的提示词已过期」长期是错的：
// 一镜没拍的项目看起来像被改坏了，全部拍完的项目看起来像毫无影响。
//
// 而且这里有个容易反着做的方向问题：**不能从「新定妆」往找下游**。
// 旧分镜的父快照是旧定妆，重新生成定妆之后，从新定妆出发查下游是查不到那批分镜的
// （它们依赖的是上一版）。正确做法是反过来：拿最新一版分镜，看它的父快照里
// 有没有最新那版定妆；没有，就说明这批分镜是照着旧定妆生成的。
import type { Shot, VisualCharacter } from "./types.ts"
import { countShotsMissingAnchors } from "./anchors.ts"

/** 做对账需要的快照字段（listSnapshots 返回的结构） */
export interface ProjectSnapshot {
  id: string
  kind: string
  version: number
  parents: string[]
  payload: unknown
}

export interface ShotAudit {
  /** 当前这一版分镜的镜头数（还没生成分镜时为 0） */
  total: number
  /** 其中提示词缺了当前锚点的镜头数；两边已经对齐时为 0 */
  expired: number
  /** 这批分镜是不是照着旧定妆生成的 */
  outOfSync: boolean
}

/**
 * 分镜对定妆的一次对账。
 *
 * `vcSnaps` / `shotsSnaps` 都按版本倒序传进来（接口就是这么返回的），取 [0] 即最新一版。
 * 两边对齐时 expired 恒为 0——不比对就不会误报，用户改完定妆重新生成分镜之后，
 * 这里应当立刻安静下来。
 */
export function auditShots(vcSnaps: ProjectSnapshot[], shotsSnaps: ProjectSnapshot[]): ShotAudit {
  const latestVc = vcSnaps[0]
  const latestShots = shotsSnaps[0]
  if (!latestShots) return { total: 0, expired: 0, outOfSync: false }

  const shots = Array.isArray(latestShots.payload) ? (latestShots.payload as Shot[]) : []
  const visuals = latestVc && Array.isArray(latestVc.payload)
    ? (latestVc.payload as VisualCharacter[])
    : []

  // 父快照里有最新那版定妆 = 这批分镜就是按它生成的，没必要再比对
  const outOfSync = !latestVc || !latestShots.parents.includes(latestVc.id)

  return {
    total: shots.length,
    expired: outOfSync ? countShotsMissingAnchors(shots, visuals) : 0,
    outOfSync,
  }
}
