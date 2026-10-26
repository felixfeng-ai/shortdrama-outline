// 成本预估演示：用一部「示例短剧」的前 10 个镜头跑一遍预算报告。
//
// 跑法（在仓库根目录）：
//   node --import ./tests/register.mjs tools/cost-demo.ts
//
// 输出两部分：1080P 定稿口径的完整报告 + 与 720P 草片口径的成本对比。
// 数据是构造的示例镜头（示意），用于看算法的输出形态，不代表任何真实项目。

import { DEFAULT_COST_CONFIG, estimateBudget } from "../lib/assets/cost.ts"
import type { Shot } from "../lib/assets/types.ts"

function shot(overrides: Partial<Shot>): Shot {
  return {
    id: "s", entityId: "e", shot: 1, episode: 1, scene: "场景",
    characters: [], action: "", speaker: "", dialogue: "", place: "",
    shotSize: "中景", camera: "固定", prompt: "", refImages: [],
    missingRefFor: [],
    params: { ratio: "9:16", duration: 10, lastFrame: false },
    status: "todo",
    ...overrides,
  }
}

// 一部示例剧的前 10 镜：刻意覆盖「便宜/中等/高危」三类
const shots: Shot[] = [
  shot({ shot: 1, episode: 1, scene: "公寓", shotSize: "特写", action: "女主在窗边发呆", characters: ["女主"], refImages: ["女主·定妆"] }),
  shot({ shot: 2, episode: 1, scene: "公寓", shotSize: "中景", action: "两人对坐交谈", characters: ["女主", "男主"], refImages: ["女主·定妆", "男主·定妆"] }),
  shot({ shot: 3, episode: 1, scene: "废弃车间", shotSize: "全景", camera: "摇", action: "男主走进车间", characters: ["男主"], refImages: ["男主·定妆", "车间·全景"] }),
  shot({ shot: 4, episode: 1, scene: "走廊", shotSize: "中景", camera: "跟随", action: "男主在走廊奔跑", characters: ["男主"], missingRefFor: ["男主"] }),
  shot({ shot: 5, episode: 1, scene: "公寓", shotSize: "近景", camera: "推", action: "女主摔碎杯子", characters: ["女主", "男主"], refImages: ["女主·定妆", "男主·定妆"] }),
  shot({ shot: 6, episode: 2, scene: "车间", shotSize: "全景", action: "三人对峙", characters: ["女主", "男主", "反派"],
    refImages: ["女主·定妆", "男主·定妆", "反派·定妆", "反派·侧脸", "反派·全身", "车间·全景"] }),
  shot({ shot: 7, episode: 2, scene: "厂房", shotSize: "中景", camera: "移", action: "两人在厂房格斗", characters: ["男主", "反派"],
    refImages: ["男主·定妆", "反派·定妆"], missingRefFor: ["反派"] }),
  shot({ shot: 8, episode: 2, scene: "公寓", shotSize: "特写", action: "女主落泪", characters: ["女主"], refImages: ["女主·定妆"] }),
  shot({ shot: 9, episode: 2, scene: "天台", shotSize: "全景", camera: "拉", action: "两人在天台相望", characters: ["女主", "男主"],
    refImages: ["女主·定妆", "男主·定妆", "天台·全景"] }),
  shot({ shot: 10, episode: 2, scene: "车间", shotSize: "中景", action: "四人冲突对峙", characters: ["女主", "男主", "反派", "小弟甲"],
    refImages: ["女主·定妆", "男主·定妆", "反派·定妆", "反派·全身", "小弟甲·定妆", "小弟甲·全身", "车间·全景", "车间·局部"] }),
]

function printReport(shots: Shot[], config = DEFAULT_COST_CONFIG): void {
  const r = estimateBudget(shots, config)
  console.log(`\n==== 成剧 · 镜头成本预估（示意数据）====`)
  console.log(`档位：${r.tier}（¥${r.tierPrice}/秒）｜参考图：前 ${config.freeRefImages} 张免费，超出 ¥${config.refImagePriceYuan}/张`)
  console.log("")
  console.log("镜  集  秒  角色  动作风险  缺图  可用率  重试  牌价     参考图费  期望成本  标记")
  for (const row of r.rows) {
    const mark = row.highRisk ? "⚠高危" : row.suggestions.length > 0 ? "注意" : ""
    console.log(
      `${pad(row.shot, 3)}${pad(row.episode, 3)}${pad(row.duration + "s", 3)}${pad(row.characters, 4)}` +
      `${pad(row.actionRisk ? "是" : "否", 6)}${pad(row.missingRef ? "是" : "否", 4)}` +
      `${pad(pct(row.usability), 6)}${pad("×" + row.retries.toFixed(2), 6)}${pad("¥" + row.baseCost.toFixed(2), 9)}` +
      `${pad("¥" + row.refCost.toFixed(2), 8)}${pad("¥" + row.expectedCost.toFixed(2), 10)}${mark}`
    )
  }
  console.log("")
  console.log(`合计：${r.rows.length} 镜 · ${r.totalSeconds} 秒 · 期望成本 ¥${r.totalExpectedCost.toFixed(2)}（已含抽卡重试）`)
  console.log(`其中参考图超量费：¥${r.totalRefCost.toFixed(2)}`)
  console.log(`分集：${r.byEpisode.map((e) => `第 ${e.episode} 集 ¥${e.cost.toFixed(2)}（${e.shots} 镜）`).join(" ｜ ")}`)
  if (r.highRiskShots.length > 0) {
    console.log(`高危镜头：${r.highRiskShots.map((s) => `#${s.shot}`).join("、")}`)
  }
  console.log("建议：")
  for (const t of r.tips) console.log(`  · ${t}`)
}

function pct(u: number): string {
  return Math.round(u * 100) + "%"
}

function pad(s: string | number, w: number): string {
  const str = String(s)
  return str.length >= w ? str : str + " ".repeat(w - str.length)
}

printReport(shots, DEFAULT_COST_CONFIG)

// 档位对比：同一批镜头，720P 草片口径能省多少
const r720 = estimateBudget(shots, { ...DEFAULT_COST_CONFIG, tier: "720p" })
const r1080 = estimateBudget(shots, DEFAULT_COST_CONFIG)
const save = (1 - r720.totalExpectedCost / r1080.totalExpectedCost) * 100
console.log(`\n---- 档位对比：同一批镜头 ----`)
console.log(`1080P 定稿口径：¥${r1080.totalExpectedCost.toFixed(2)}`)
console.log(`720P 草片口径：¥${r720.totalExpectedCost.toFixed(2)}（省 ${save.toFixed(0)}%，七成重抽发生在草片阶段，定稿再升档）`)
