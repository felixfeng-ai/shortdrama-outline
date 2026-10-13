# 交接：额度控制 + 开源化（进行中）

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
