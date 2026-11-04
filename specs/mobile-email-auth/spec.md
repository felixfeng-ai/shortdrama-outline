# 原生 App · 与 Web 共用邮箱登录

## 1. 目标

App 不建立第二套账号体系。登录直接调用当前 Web 后端的邮箱验证码接口，最终使用同一个 `user_id`、同一批项目和同一套额度。

## 2. 确认的 Web 登录方式

- 邮箱地址 + 6 位验证码，不使用密码。
- 验证码 5 分钟有效，60 秒发送冷却，单验证码最多尝试 5 次。
- Web 使用 `chengju_auth` HttpOnly Refresh Session Cookie。
- App 登录请求带 `client: "app"`，服务端返回：
  - 15 分钟 Access Token。
  - 30 天可轮换 Refresh Token。
- App 业务请求使用 `Authorization: Bearer <accessToken>`。
- Refresh 时轮换 Refresh Token，旧 Token 立即失效。
- 登录成功会把当前匿名会话项目迁移到正式账号。

## 3. App 行为

### R1 邮箱验证码

Given 用户未登录
When 输入有效邮箱并请求验证码
Then App 调用 Web 同一个邮件验证码接口，并进入验证码输入步骤。

### R2 登录

Given 用户输入有效验证码
When 登录成功
Then App 保存 Access/Refresh Token，显示与 Web 相同的邮箱账号，并重新拉取该账号项目。

### R3 安全存储

- 原生端使用 Keychain / Keystore 保存 Refresh Token。
- Expo Web 预览使用 localStorage。
- Access Token 只保存在内存和受控存储中，不写日志。

### R4 自动刷新

Given 业务请求前 Access Token 即将过期或接口返回 401
Then App 使用 Refresh Token 换取新 Token，并重试一次原请求。

### R5 退出

Given 用户退出
Then App 撤销当前服务端会话、清理本地 Token，并回到匿名工作区。

### R6 与 Web 共用

Given App 和 Web 使用同一个邮箱登录
Then 两端得到同一个 `user_id`，读取同一项目和额度。

## 4. 边界

- 不新增 App 专属用户表。
- 不复制 Web 的账号服务逻辑到客户端。
- 不把邮箱验证码或 Refresh Token 写入日志。
- 当前登录方式以邮箱验证码为准；Apple 登录如后续加入，也必须落到同一 `user_id`。

## 5. 验证

- 邮箱验证码请求、验证码登录、刷新、退出与 401 重试测试通过。
- CORS 允许 `Authorization`、`X-Chengju-Client` 和 `X-Chengju-Device`。
- 使用 Web 本地开发验证码完成 App 登录，并验证 Web/App 读取同一项目。
- 390/375 验证邮箱、验证码、已登录和错误状态。

## 6. 当前验收

- Web 端确认：邮箱验证码 5 分钟有效、60 秒冷却、App 返回 15 分钟 Access Token 和 30 天 Refresh Token。
- 隔离数据库实测 App Bearer 与 Web Cookie 能读取同一个账号的同一个项目。
- Refresh Token 成功轮换，旧 Refresh Token 再用返回 401。
- App 登录后 `/api/mobile/context` 请求已确认携带 `Authorization: Bearer ...`。
- 390×844 与 375×812 的邮箱、验证码、已登录页面通过截图验收，无横向溢出。
- Web 端全量测试 637 条通过，移动端 36 条测试通过；两套 TypeScript 检查和构建通过。
- 真机 Keychain/Keystore、后台恢复和真实邮件收件仍需后续验收。
