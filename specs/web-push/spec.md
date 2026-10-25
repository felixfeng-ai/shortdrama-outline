# Web Push 生成通知

> 目标：用户离开页面后，关键帧生成完成或失败仍能收到通知，并能一键回到对应步骤。

## 1. 能力

- 用户在浏览器明确授权后订阅当前设备的 Web Push。
- 订阅按匿名会话 owner 隔离，保存 endpoint、p256dh 与 auth。
- 角色定妆成功通知跳转 `?step=visuals`；镜头首帧成功通知跳转 `?step=shots`。
- 生成失败通知包含可读失败原因，不包含 API Key、提示词全文或服务器路径。
- 用户可关闭通知，删除当前设备订阅。

## 2. 硬边界

- 不自动请求通知权限，必须由用户点击开启。
- 只接受 HTTPS 且属于主流浏览器推送服务的 endpoint。
- VAPID 私钥只存在服务端环境变量，不返回浏览器。
- 推送失败不能影响生成结果落库或接口成功响应。
- 用户主动取消生成不推送；成功和失败才推送。
- 同一设备重复订阅使用 endpoint 幂等更新。

## 3. 场景

### T1 开启和关闭

**Scenario T1.1**
Given 浏览器支持 Push API 且用户尚未授权
When 用户点击“开启完成通知”
Then 浏览器请求权限，授权后注册 Service Worker、创建 subscription 并保存到服务端。

**Scenario T1.2**
Given 当前设备已经订阅
When 用户关闭完成通知
Then 服务端删除该 endpoint，浏览器取消本地 subscription。

### T2 生成完成通知

**Scenario T2.1**
Given 当前 owner 有有效订阅
When 关键帧生成成功
Then 推送标题说明定妆图或镜头首帧已完成，点击后打开对应步骤。

**Scenario T2.2**
Given 关键帧生成失败
When 任务进入 failed
Then 推送失败摘要，不允许暴露 Key 或内部文件路径。

### T3 异常回退

**Scenario T3.1**
Given 推送服务返回 404 或 410
When 服务端发送通知
Then 删除失效订阅，生成接口仍按正常结果返回。

## 4. 验收

- endpoint 校验、订阅幂等、失效订阅清理、通知内容均有单元测试。
- Service Worker 支持 `push` 与 `notificationclick`。
- 生成接口调用推送失败时不影响关键帧成功。
- 全量测试、类型检查、生产构建和本地浏览器权限态验收通过。
