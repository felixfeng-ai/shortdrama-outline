# 交接：额度控制 + 开源化（进行中）

> 写于 2026-10-14。**重启 Codex 后读这个文件即可无缝接上。**
> 交接原因：模型从 `deepseek-v4-flash` 换成 `deepseek-v4-pro`，需重启加载。

---

## 〇、本轮做了什么（关键词联想 + 题材风格）

> 2026-10-14 第二轮。已完成并推送，此节仅作记录。

### 背景：用户反馈「输入一句话想法」入口不完善

原状只有 4 个写死的示例想法可点，用户要么照抄示例，要么自己憋出一句话。
真实断点是**「有模糊方向（比如想写快递员），但组织不成一句完整的话」**——多给几个示例救不了这种人。
同时短剧风格此前完全由模型猜，用户无法控制，是真实的能力缺口。

### 方案（两个改动，都只碰入口，不动下游六步）

1. **关键词 → LLM 联想出 3 个候选想法**
   输入「快递员、钥匙」→ 返回 3 个方向明显不同的候选，点一下填进文本框。
   **关键词本身不直接生成剧本**——保证「一句话」始终是唯一真实输入，下游 6 个 prompt 无需改动。

2. **题材风格做成项目级参数**（8 种：不限 / 都市 / 情感 / 职场 / 悬疑 / 家庭 / 逆袭复仇 / 奇幻设定）
   做成项目级而非一次性开关，避免「选了情感、三幕却往悬疑跑」。
   通过 `genreClause(genre)` 统一注入 5 处 prompt。
   `buildImagePrompt` **刻意不注入**——出图提示词与题材无关。

### 改动的文件

| 文件 | 改动 |
|---|---|
| `lib/types.ts` | `Genre` / `GENRES`(8 种) / `readGenre`(非法值回落 `none`，不 500) / `IdeaCandidate` / `MAX_KEYWORD_LENGTH=40` / `MAX_IDEAS_PER_ROUND=3` |
| `lib/prompts.ts` | `genreClause(genre)` + `buildIdeaPrompt(keywords, genre)`，5 处注入 |
| `lib/assets/prompts.ts` | 定妆/场次/分镜 3 个 builder 加 `genre` 参数并注入 |
| `app/api/ideas/route.ts` | **新增**：关键词 → 3 候选，含 `normalizeIdeas` 兜底字段名漂移，温度 1.1 |
| 6 个路由 | characters / acts / episodes / visual / scenes / shots 全部透传 genre（episodes/shots 是流式路由，genre 需提到 try 外声明） |
| `lib/quota.ts` | 加 `ideas: 1` 权重；**修正 `FULL_PROJECT_COST`** 从 `Object.values(STEP_COST)` 求和改为显式列举六步（否则新增辅助步骤会悄悄抬高「一个完整项目多少钱」这个对外承诺），仍为 13 |
| `components/IdeaPanel.tsx` | 重写：关键词输入（回车联想）+ 常用词快填 + 候选卡片（点击填入）+ 风格胶囊（`aria-pressed`，默认「不限」，不强制选择） |
| `app/page.tsx` | 加 `genre` 状态并透传到全部六步 + ideas |
| `lib/assets/api.ts` | `generateVisuals` / `generateScenes` 加 `genre = "none"` 参数 |
| `tests/ideas.test.ts` | 新增 11 例 |

### 验证（全绿）

- `npx tsc --noEmit` → 0 错误
- `npm test` → **111/111**
- `npm run build` → 成功，15 路由（含 `/api/ideas`）
- Playwright 1440 / 390 两档 → overflow 均为 0
- 端到端实测：关键词「快递员、钥匙」+ 职场 → 3 候选方向确实不同；奇幻 vs 职场 同关键词输出明显不同；非法风格回落「不限」200；空关键词 400

### 提交

- `049c657` fix(ui): 修复右侧溢出 + 移动端适配 + 视觉升级 → 已推送
- `0192190` feat(idea): 关键词联想 + 题材风格 → 已推送

---

---

## 一、为什么做这件事（背景）

### 商业模式已定：C 模式 —— 开源自建 + 托管收费

参照 n8n(20.7w star) / Cal.com(4.9w) / Plane(6.1w) / Dify(15.8w) / Supabase(11.1w)，
全是同一模式。对我们而言它和两条硬指标**恰好咬合**：

| 定位 | 在 C 模式下 |
|---|---|
| 零部署 | **付费的那一份**（自建要装 Node 22+、配 key、运维） |
| 零上传 | **开源的那一份**（闭源只能信承诺，开源可审计代码） |

### 竞品调研结论（已实查 GitHub API）

| 项目 | Stars | License | 关键发现 |
|---|---|---|---|
| chatfire-AI/huobao-drama | 16151 | NOASSERTION | open issue 全是「装不上/起不来」（#137 无法启动、#125 mac 报错、#135 arm64 ffprobe 是 x86） |
| Forget-C/Jellyfish | 6722 | Apache-2.0 | **96% issue 被标 stale、停更半年**；用户原话「一大堆问题根本没法用」「有没有跑起来的举个手」 |
| zenstory-ai/drama-skills | 2827 | MIT | 撞我们「本地不上传」口号，但是 Claude Code skill，面向会 agent 的人 |

**核心结论：行业真痛点不是「功能不够」，是「拿到手跑不起来」。**
这直接支撑「零部署」作为付费点。

---

## 二、当前进度

| # | 任务 | 状态 |
|---|---|---|
| 1 | `lib/quota.ts` 额度 + 熔断核心 | ✅ **完成（146 行）** |
| 2 | `lib/assets/db.ts` 接入 quota 建表 | ⬜ 待做 |
| 3 | 六个生成路由接额度闸门 | ⬜ 待做 |
| 4 | `/api/quota` 接口 + 前端额度显示 | ⬜ 待做 |
| 5 | 测试（额度/熔断/身份） | ⬜ 待做 |
| 6 | LICENSE（AGPL-3.0）+ README 自部署章节 | ⬜ 待做 |

### 已完成的 `lib/quota.ts` 提供的 API

```ts
// 常量
STEP_COST              // 各步权重：characters1 acts1 episodes3 visual2 scenes2 shots4
FULL_PROJECT_COST      // =13，跑完一个完整项目的额度
DAILY_UNITS_PER_IDENTITY  // 默认 26（=2 个项目），env: CHENGJU_DAILY_UNITS
DAILY_UNITS_GLOBAL     // 默认 3900（≈300 项目），env: CHENGJU_DAILY_UNITS_GLOBAL

// 函数
ensureQuotaSchema(db)        // 建表，幂等
todayKey(now?)               // UTC 日期键
getQuota(db, identity, now?) // 查用量，返回 QuotaSnapshot
chargeQuota(db, identity, step, now?) // 扣额度；超限抛 QuotaError(429)
identityFromRequest(req)     // 从 X-Forwarded-For / x-real-ip 取匿名身份
QuotaError                   // status=429，已被 lib/api.ts 的 errorResponse 识别
```

```sql
-- usage_log 表结构
id INTEGER PK AUTOINCREMENT
identity TEXT      -- 匿名身份（IP 或指纹）
step TEXT          -- characters/acts/episodes/visual/scenes/shots
units INTEGER      -- 本步权重
day TEXT           -- UTC 日期键 YYYY-MM-DD
created_at INTEGER
-- 索引：idx_usage_identity_day(identity,day) / idx_usage_day(day)
```

---

## 三、后续怎么做（按顺序，每步都可独立验收）

### 第 2 步：db.ts 接入建表

`lib/assets/db.ts` 的 `openDb()` 里，`db.exec(SCHEMA)` 之后加一行调用
`ensureQuotaSchema(db)`（注意 import 路径会形成 lib/quota.ts ← lib/assets/db.ts
的单向依赖，quota.ts 只 import type，不会循环）。

### 第 3 步：六个路由接线

要改的六个路由（都在 `app/api/`）：
`characters`、`acts`、`episodes`、`visual`、`scenes`、`shots`

统一模式（**注意顺序**）：

```ts
import { getDbForRequest } from "@/lib/assets/store"
import { chargeQuota, identityFromRequest } from "@/lib/quota"

// 在入参校验通过之后、调用模型之前：
chargeQuota(getDbForRequest(), identityFromRequest(req), "characters")  // step 名对应 STEP_COST 的 key
```

**两个流式路由（episodes / shots）的特别之处**：必须在 `new ReadableStream` **之前**扣额度，
否则流已经建立了再抛 429，前端读到的是断裂的 SSE 而不是 JSON 信封。
（入参校验失败也是这样处理的，照抄那个位置即可。）

扣额度失败抛 `QuotaError` → `errorResponse` 已支持带 `status` 的 Error → 返回 429 + 中文文案。

### 第 4 步：`/api/quota` + 前端

- `app/api/quota/route.ts`：GET，返回 `getQuota(db, identityFromRequest(req))`
- 前端在 IdeaPanel 或底部显示「今日剩余额度」，超限时禁用生成按钮

### 第 5 步：测试

新建 `tests/quota.test.ts`，用 `:memory:` 库。至少要覆盖：
- 扣额度后 `getQuota` 数值正确
- 超过单身份上限抛 `QuotaError`
- 全站熔断触发
- 各 step 权重符合 `STEP_COST`
- `identityFromRequest` 取 X-Forwarded-For 正确

注意：**测试必须走 `getDataDir()`**，不要直接读 `CHENGJU_DATA_DIR`
（踩过坑，见下面「已知的坑」）。

### 第 6 步：开源化

- 加 `LICENSE`，**AGPL-3.0**（防套壳：谁拿代码对外提供服务就必须开源修改）
- README 补完整「自部署」章节 —— **这必须是我们比竞品强的地方**：
  Jellyfish 的 issue #2 原话就是「部署方式是不是没介绍清楚」。我们开源后不能犯同样的错。

---

## 四、已知的坑（都踩过，别再踩）

1. **PowerShell 内联 node 会被引号转义坑死**（反引号与 `# 交接：额度控制 + 开源化（进行中）

> 写于 2026-10-14。**重启 Codex 后读这个文件即可无缝接上。**
> 交接原因：模型从 `deepseek-v4-flash` 换成 `deepseek-v4-pro`，需重启加载。

---

## 一、为什么做这件事（背景）

### 商业模式已定：C 模式 —— 开源自建 + 托管收费

参照 n8n(20.7w star) / Cal.com(4.9w) / Plane(6.1w) / Dify(15.8w) / Supabase(11.1w)，
全是同一模式。对我们而言它和两条硬指标**恰好咬合**：

| 定位 | 在 C 模式下 |
|---|---|
| 零部署 | **付费的那一份**（自建要装 Node 22+、配 key、运维） |
| 零上传 | **开源的那一份**（闭源只能信承诺，开源可审计代码） |

### 竞品调研结论（已实查 GitHub API）

| 项目 | Stars | License | 关键发现 |
|---|---|---|---|
| chatfire-AI/huobao-drama | 16151 | NOASSERTION | open issue 全是「装不上/起不来」（#137 无法启动、#125 mac 报错、#135 arm64 ffprobe 是 x86） |
| Forget-C/Jellyfish | 6722 | Apache-2.0 | **96% issue 被标 stale、停更半年**；用户原话「一大堆问题根本没法用」「有没有跑起来的举个手」 |
| zenstory-ai/drama-skills | 2827 | MIT | 撞我们「本地不上传」口号，但是 Claude Code skill，面向会 agent 的人 |

**核心结论：行业真痛点不是「功能不够」，是「拿到手跑不起来」。**
这直接支撑「零部署」作为付费点。

---

## 二、当前进度

| # | 任务 | 状态 |
|---|---|---|
| 1 | `lib/quota.ts` 额度 + 熔断核心 | ✅ **完成（146 行）** |
| 2 | `lib/assets/db.ts` 接入 quota 建表 | ⬜ 待做 |
| 3 | 六个生成路由接额度闸门 | ⬜ 待做 |
| 4 | `/api/quota` 接口 + 前端额度显示 | ⬜ 待做 |
| 5 | 测试（额度/熔断/身份） | ⬜ 待做 |
| 6 | LICENSE（AGPL-3.0）+ README 自部署章节 | ⬜ 待做 |

### 已完成的 `lib/quota.ts` 提供的 API

```ts
// 常量
STEP_COST              // 各步权重：characters1 acts1 episodes3 visual2 scenes2 shots4
FULL_PROJECT_COST      // =13，跑完一个完整项目的额度
DAILY_UNITS_PER_IDENTITY  // 默认 26（=2 个项目），env: CHENGJU_DAILY_UNITS
DAILY_UNITS_GLOBAL     // 默认 3900（≈300 项目），env: CHENGJU_DAILY_UNITS_GLOBAL

// 函数
ensureQuotaSchema(db)        // 建表，幂等
todayKey(now?)               // UTC 日期键
getQuota(db, identity, now?) // 查用量，返回 QuotaSnapshot
chargeQuota(db, identity, step, now?) // 扣额度；超限抛 QuotaError(429)
identityFromRequest(req)     // 从 X-Forwarded-For / x-real-ip 取匿名身份
QuotaError                   // status=429，已被 lib/api.ts 的 errorResponse 识别
```

```sql
-- usage_log 表结构
id INTEGER PK AUTOINCREMENT
identity TEXT      -- 匿名身份（IP 或指纹）
step TEXT          -- characters/acts/episodes/visual/scenes/shots
units INTEGER      -- 本步权重
day TEXT           -- UTC 日期键 YYYY-MM-DD
created_at INTEGER
-- 索引：idx_usage_identity_day(identity,day) / idx_usage_day(day)
```

---

## 三、后续怎么做（按顺序，每步都可独立验收）

### 第 2 步：db.ts 接入建表

`lib/assets/db.ts` 的 `openDb()` 里，`db.exec(SCHEMA)` 之后加一行调用
`ensureQuotaSchema(db)`（注意 import 路径会形成 lib/quota.ts ← lib/assets/db.ts
的单向依赖，quota.ts 只 import type，不会循环）。

### 第 3 步：六个路由接线

要改的六个路由（都在 `app/api/`）：
`characters`、`acts`、`episodes`、`visual`、`scenes`、`shots`

统一模式（**注意顺序**）：

```ts
import { getDbForRequest } from "@/lib/assets/store"
import { chargeQuota, identityFromRequest } from "@/lib/quota"

// 在入参校验通过之后、调用模型之前：
chargeQuota(getDbForRequest(), identityFromRequest(req), "characters")  // step 名对应 STEP_COST 的 key
```

**两个流式路由（episodes / shots）的特别之处**：必须在 `new ReadableStream` **之前**扣额度，
否则流已经建立了再抛 429，前端读到的是断裂的 SSE 而不是 JSON 信封。
（入参校验失败也是这样处理的，照抄那个位置即可。）

扣额度失败抛 `QuotaError` → `errorResponse` 已支持带 `status` 的 Error → 返回 429 + 中文文案。

### 第 4 步：`/api/quota` + 前端

- `app/api/quota/route.ts`：GET，返回 `getQuota(db, identityFromRequest(req))`
- 前端在 IdeaPanel 或底部显示「今日剩余额度」，超限时禁用生成按钮

### 第 5 步：测试

新建 `tests/quota.test.ts`，用 `:memory:` 库。至少要覆盖：
- 扣额度后 `getQuota` 数值正确
- 超过单身份上限抛 `QuotaError`
- 全站熔断触发
- 各 step 权重符合 `STEP_COST`
- `identityFromRequest` 取 X-Forwarded-For 正确

注意：**测试必须走 `getDataDir()`**，不要直接读 `CHENGJU_DATA_DIR`
（踩过坑，见下面「已知的坑」）。

### 第 6 步：开源化

- 加 `LICENSE`，**AGPL-3.0**（防套壳：谁拿代码对外提供服务就必须开源修改）
- README 补完整「自部署」章节 —— **这必须是我们比竞品强的地方**：
  Jellyfish 的 issue #2 原话就是「部署方式是不是没介绍清楚」。我们开源后不能犯同样的错。

---

## 四、已知的坑（都踩过，别再踩）

 会被 shell 吞掉，报 Unterminated regexp）。
   → **必须写成临时 .cjs 文件再执行**，用完删掉。
2. **`.cjs` 里不能用顶层 await**，要写成 `async function main(){}` 或改成 `.mjs`。
3. **临时脚本要记得自删**，否则仓库根堆一堆 `_xxx.cjs`。
4. **测试不要直接读 `process.env.CHENGJU_DATA_DIR`**，子进程里可能是空的，
   会拼出 `undefined/` 目录。一律走 `getDataDir()`。
5. **复杂长命令容易被 policy 拦**（如 `Start-Process` / `cmd /c start`）。
6. **推送 GitHub 偶发 `SSL_ERROR_SYSCALL`**，重试即可，用
   `git -c http.version=HTTP/1.1 push origin main` 成功率更高。

---

## 五、模型与协作方式

- 配置已改：`model = "deepseek-v4-pro"`，`model_reasoning_effort = "high"`（需重启生效）
- **协作原则（重要）**：之前的 flash 模型容易「做完一步就收尾」。
  改进方式：**小块交付，每次 2-3 个动作就报进度**，便于随时接续。
- 回答一律用**中文**。

---

## 六、仓库当前状态

```
分支 main，与 origin/main 同步
最近提交：
  1a52962 docs(readme): 改为 GitHub 展示风格
  ee534af feat(assets): 资产层界面收口
  a7bd870 docs(readme): 重构定位叙事
  cf27162 fix(test): 测试不再散落临时库

测试 85/85 通过 · tsc --noEmit 通过 · npm run build 通过（13 路由）
dev server 在 3000（CHENGJU_DATA_DIR=D:\Project\drama-outline\data）
库里 2 个真实项目（勿删）
```

**未提交**：`lib/quota.ts`（新增，还没接线所以没提交）
