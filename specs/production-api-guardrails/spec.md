# 生产调用风控

## 目标

在模型生成、场记、图像生成、项目导出和项目导入入口加入统一请求限流。限流按来源 IP、账号身份和全站窗口三层计算，计数持久化到 SQLite，超过限制时返回可读的 `429`，并记录结构化安全事件。

## P0 能力点

### G1 · 统一限流策略

- 六步文本生成与素材识别属于 `model` 组。
- 场记与镜头助手属于 `assistant` 组。
- 云端关键帧生成属于 `image` 组。
- 项目导出属于 `export` 组，项目包导入属于 `import` 组。
- 每组都有 IP 十分钟、账号十分钟和全站二十四小时规则；阈值可通过环境变量覆盖。
- 未取得 `X-Real-IP` 时所有请求共享 `unknown` 来源桶，不能绕过限流。

### G2 · 原子计数与拒绝

- 一次请求的所有规则在同一 SQLite `BEGIN IMMEDIATE` 事务内检查和递增。
- 任一规则超限时整组计数都不递增，并返回 `RequestRateLimitError`。
- 错误包含 `retryAfterSeconds`；API 响应状态为 `429`，并带 `Retry-After` 头。
- 超限事件写入结构化告警日志，日志不含原始账号或 IP。

### G3 · 入口覆盖

- 文本入口：`ideas`、`characters`、`acts`、`episodes`、`scenes`、`shots`、`visual`、`asset-match`。
- 助手入口：`agent`、`assistant`。
- 图像入口：`generations`。
- 文件入口：`export`、`project-import`。
- 限流必须发生在额度扣减和模型/Provider 调用之前。

## 验收场景

### Scenario G1

**Given** 同一 IP 在十分钟内发起超过 `model` 组限制的文本生成请求

**When** 下一次请求到达任意文本生成入口

**Then** 返回 `429`，正文提示稍后再试，并带 `Retry-After`，模型调用不发生。

### Scenario G2

**Given** 同一账号轮换 IP 发起请求

**When** 账号十分钟计数超过限制

**Then** 仍被拒绝，说明账号层规则独立生效。

### Scenario G3

**Given** 数据库重新打开

**When** 窗口内继续请求

**Then** 先前计数仍然存在，重启不能重置限流。

### Scenario G4

**Given** 请求已被额度系统拒绝或等待 Provider

**When** 请求进入路由

**Then** 风控先于额度扣减与外部调用执行。

## 不在本期

- Redis 原子限流和多实例共享计数。
- 外部告警平台、自动封禁后台和人工处置工单。
- 登录验证码限流改造；它已有独立规则。
