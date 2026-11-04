# App 真机与上架就绪清单

更新：2026-11-04

## 命名建议

| 场景 | 建议 | 原因 |
| --- | --- | --- |
| 手机桌面名称 | `成剧` | 两字，易识别，与 Web 中文品牌一致 |
| App Store / 应用商店标题 | `成剧 VeyaFrame` | “成剧”单独过于通用；`VeyaFrame` 在国区 App Store 检索无同名结果 |
| 首页品牌副标 | `VEYAFRAME` | 去掉开发态的 `APP` 后缀 |
| EAS slug | `chengju` | 对齐中文品牌，作为内部项目标识 |
| URL Scheme | `chengju` | 与正式品牌一致，但发布后不要随意修改 |
| iOS Bundle ID | `work.chenju.app` | 当前 `work.chenju.veyaframe` 可用，但新包建议更短、与品牌一致 |
| Android Package | `work.chenju.app` | 必须与 iOS 一起在首次发布前决定 |

注意：如果已经向 TestFlight、App Store 或 Android 商店提交过当前包名，不能直接改名；改名会被视为另一个 App。未提交前才建议统一。

## 已确认

- Web 使用邮箱验证码登录，不是密码登录。
- App 已调用相同邮箱验证码接口，使用 15 分钟 Access Token 和 30 天轮换 Refresh Token。
- App 与 Web 获得同一个 `user_id`，共用项目和额度。
- App 写回创建同一套 `snapshots` 新版本，并使用 `baseShotsSnapshotId` 检测冲突。
- Web CORS 允许 Bearer 与 App 设备头。
- Expo 依赖已对齐 SDK 58。

## 当前阻塞

### 1. 当前机器没有真机构建工具

- `adb`：未安装
- Android Emulator：未安装
- EAS CLI：未安装
- Xcode / `xcrun`：Windows 环境不可用

因此本机无法证明：

- Keychain / Keystore 实际持久化。
- 原生 App 是否正确处理 Bearer 与刷新。
- 键盘、安全区、相册、推送和后台恢复。
- iOS / Android 商店包是否可安装。

线上接口已核对：`https://chenju.work/api/health` 与
`https://chenju.work/api/mobile/context` 均返回 200。API 可访问不等于真机流程已验收。

## 功能缺口

### P0 上架阻断

1. 真实 iPhone / Android 安装、登录和系统权限验证。
2. EAS Project ID、APNs/FCM 凭据与真机推送送达。
3. Apple / Google 沙盒购买、恢复购买和退款/到期处理。
4. 商店截图、隐私表单、审核备注和测试账号。
5. 中国大陆上线所需的 App 备案、ICP、算法/生成式 AI 材料和主体信息。
6. 崩溃监控与商店正式签名构建仍需在账号环境中验收。

### P1 体验完整度

- 相机、相册和语音输入。
- 弱网、断网、重试和请求恢复。
- 项目分享与只读审片链接。
- 离线最近项目。
- 表格/平板适配和横屏策略。
- 更完整的运行任务跨页恢复。

## 发布前最小验收路径

1. 用同一邮箱在 Web 登录并创建项目。
2. App 登录后看到同一项目。
3. App 向 Agent 提问，确认工具调用和回答。
4. App 写回一条镜头建议，Web 刷新看到新分镜版本。
5. Web 并发更新后，App 再写回必须返回 409。
6. App 杀进程重开，Refresh Token 可恢复登录。
7. Access Token 过期后，App 自动刷新并重试业务请求。
8. 真机收到推送，点击深链进入对应镜头。
9. 商店沙盒完成一次订阅购买和恢复购买。
10. 账号删除后，项目、会话和资产按政策清理。

## EAS 准备

已添加：

- `mobile/eas.json`
- `mobile/.env.production`
- 详细构建步骤：[IOS-TESTFLIGHT-ANDROID-APK.md](./IOS-TESTFLIGHT-ANDROID-APK.md)

待完成：

```bash
npx eas-cli login
npx eas-cli init
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile preview --platform ios
```

iOS 构建需要 Apple Developer 账号和已登记的测试设备；Android 可先产出内测 APK。
个人 Apple Developer 账号可以使用 TestFlight 和 App Store；正式签名、上传和商店审核没有在本机执行。
