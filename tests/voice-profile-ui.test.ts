import { test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"

function read(path: string): string {
  return fs.existsSync(path) ? fs.readFileSync(path, "utf8") : ""
}

test("P1-V5 分镜页提供项目级角色音色绑定", () => {
  const shotList = read("components/ShotList.tsx")
  assert.match(shotList, /VoiceProfilePanel/)
  assert.match(shotList, /characters=\{characters\}/)
})

test("P1-V5 音色面板只允许系统音色并明确不支持声音克隆", () => {
  const panel = read("components/VoiceProfilePanel.tsx")
  assert.match(panel, /系统音色/)
  assert.match(panel, /不支持声音克隆/)
  assert.match(panel, /deleteVoiceProfile/)
  assert.match(panel, /generateShotTts/)
  assert.match(panel, /generateShotTtsBatch/)
  assert.match(panel, /本集对白/)
  assert.match(panel, /生成 .* 句/)
  assert.match(panel, /本集有声/)
})

test("P1-V5 音色客户端通过项目接口读写，不保存本地声音样本", () => {
  const client = read("lib/audio/client.ts")
  assert.match(client, /\/api\/audio\/voice-profiles/)
  assert.match(client, /projectId/)
  assert.doesNotMatch(client, /localStorage|indexedDB|FileReader/)
})
