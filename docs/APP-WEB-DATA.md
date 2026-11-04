# App 与 Web 的数据共用

成剧的 App 和 Web 不各自维护一份项目数据，也不做定时数据库同步。两者连接同一个 Next.js 服务端和同一个 SQLite 数据库，只是使用不同的界面与接口入口。

## 一份数据，两个客户端

```text
Web · Next.js
      │
      ├─ /api/projects
      ├─ /api/snapshots
      └─ /api/agent
      │
App · Expo / React Native
      │
      ├─ /api/mobile/context
      ├─ /api/mobile/agent
      └─ /api/mobile/agent/apply
      │
      ▼
同一服务端 · 同一 SQLite
      ├─ projects
      ├─ snapshots（按 kind + version）
      ├─ lineage
      ├─ generated_assets
      └─ generation_tasks
```

## 身份与会话

- Web 和 App 使用同一套邮箱验证码账号，最终身份都是同一个 `user_id`。
- Web 登录后使用 `chengju_auth` HttpOnly Cookie。
- App 登录请求带 `client: "app"`，服务端返回 15 分钟 Access Token 和 30 天 Refresh Token。
- App 业务请求使用 `Authorization: Bearer <accessToken>`；刷新时轮换 Refresh Token。
- 未登录时仍使用 `chengju_sid` 匿名会话；首次登录会把当前匿名项目迁移到正式账号。
- 本地 API 与 App 预览必须指向同一个服务端和数据目录，才会看到同一批项目。

## 读取链路

- Web 通过 Cookie 调用 `/api/projects` 和 `/api/snapshots` 读取项目与最新产物。
- App 通过 `/api/mobile/context` 读取面向手机压缩后的当前项目、集/场、镜头数与额度。
- App 可以使用 Bearer Access Token；服务端统一通过 `resolveProjectOwner` 解析为同一个 `user_id`。
- `/api/mobile/context` 不另建移动端数据库，直接从相同的 `projects` / `snapshots` 生成。
- App 的 Agent 也从同一批最新快照构建 `AgentState`。

## 写入链路

- Web 编辑产物后通过 `POST /api/snapshots` 创建新版本。
- App 接受 Agent 镜头建议后通过 `POST /api/mobile/agent/apply` 创建新的 `shots` 快照。
- 两条路径最终都调用 `persistEditedArtifact`，因此版本号、血缘和项目更新时间保持一致。
- App 写回成功后会重新请求 `/api/mobile/context`；Web 刷新或重新加载项目后会读取到同一最新版本。

## 并发保护

Agent 生成建议时会返回它所读取的 `baseShotsSnapshotId`。App 确认写回时必须携带这个 ID：

- ID 仍是最新分镜版本：创建下一版。
- Web 或其他设备期间已经写入：返回 `409`，App 保留建议并提示重新读取。

这避免了移动端基于旧上下文覆盖 Web 新修改。

## 当前边界

- App 与 Web 已共用邮箱账号、项目、快照、Agent 上下文和分镜写回链路。
- 目前还没有实时推送或 WebSocket；另一端需要刷新/重新进入页面获取最新版本。
- 任务页和审片资产仍未完全接到真实 `generation_tasks` / `generated_assets`。
- 原生 iOS/Android 的 Keychain/Keystore、后台恢复和 Token 过期刷新仍需真机验证。
