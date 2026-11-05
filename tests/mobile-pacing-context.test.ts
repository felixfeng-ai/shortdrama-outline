import assert from "node:assert/strict"
import test from "node:test"

import { buildMobileContext } from "../lib/mobile-context.ts"

test("Mobile Context 直接携带按集节奏分析", () => {
  const context = buildMobileContext({
    projects: [{
      id: "p1",
      title: "雨夜快递",
      ownerId: "owner-1",
      createdAt: 1,
      updatedAt: 2,
    }],
    snapshots: {
      episodes: [{
        number: 1,
        title: "门缝里的车票",
        hook: "门里伸出一只手，把一张四十年前的车票塞回他掌心。",
        intensity: 3,
      }],
      shots: [{
        id: "shot-row",
        entityId: "shot-a",
        episode: 1,
        shot: 1,
        scene: "旧楼门口",
        characters: [],
        action: "",
        speaker: "",
        dialogue: "你好，有你的快递。",
        prompt: "close shot",
        refImages: [],
        missingRefFor: [],
        params: { ratio: "9:16", duration: 5, lastFrame: false },
        status: "todo",
      }],
    },
    quota: { remaining: 20, limit: 65, used: 45, projectsLeft: 1 },
    now: 3,
  })

  assert.equal(context.pacing.rows[0].episode, 1)
  assert.equal(context.pacing.rows[0].shotCount, 1)
  assert.equal(context.pacing.rows[0].averageShotSeconds, 5)
  assert.ok(context.pacing.warnings.some((item) => item.includes("镜头不足")))
})
