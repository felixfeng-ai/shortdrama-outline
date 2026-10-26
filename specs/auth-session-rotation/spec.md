# 跨端会话与短期访问令牌

> 目标：App 业务请求不再携带 30 天 refresh token；短期 access token 失效后，用 refresh session 换新。

## 能力

- Web 继续使用 HttpOnly refresh cookie；App 登录后获得 access token 与 refresh token。
- Access token 有效期 15 分钟，服务端可验证签名并确认对应会话未撤销。
- Refresh token 有效期 30 天，只用于换取新 access token 或退出。
- 账号页列出活跃会话，可退出除当前设备外的单个会话。
- 会话记录保存客户端类型、设备名称、User-Agent、最后活跃时间和过期时间。
- 撤销会话后，对应的 access token 与 refresh token 都立即失效。

## 场景

### R1 App 登录

**Given** App 用户完成验证码登录

**When** 服务端返回登录结果

**Then** 同时返回短期 `accessToken` 与长期 `refreshToken`，且数据库只保存 token 哈希。

### R2 刷新访问令牌

**Given** App 持有未撤销的 refresh token

**When** 调用刷新接口

**Then** 返回新的短期 access token；refresh session 本身仍保持 30 天有效。

### R3 Access 过期与会话撤销

**Given** access token 已签发

**When** 超过 15 分钟或对应会话被撤销

**Then** 该 access token 不能再读取用户数据。

### R4 设备会话管理

**Given** 同一用户有 Web 和 App 两个活跃会话

**When** 用户在账号页退出 App 会话

**Then** 列表只保留当前 Web 会话，App 的 access 与 refresh token 同时失效。

## 验收

- 令牌签发、验证、刷新、过期和撤销均有单元/API 测试。
- 账号页显示会话设备、最近活跃时间和当前设备标识。
- TypeScript、全量测试、生产构建和桌面/手机浏览器验收通过。
