# iOS 内测、TestFlight 与 Android APK

更新：2026-11-04

这份说明只处理 Expo / React Native 原生安装包，不把浏览器预览或 PWA 当作 App。

## 先决条件

- 已安装 Node.js 20+，并能在 `mobile/` 下执行 `npm install`。
- 有 Expo 账号，并执行 `npx eas-cli@latest login`。
- Android 内测只需要 Expo 账号和 EAS 签名；Google Play 内测发布另需 Play Console。
- iOS 安装包需要 Apple Developer Program。个人开发者账号可以发布到 App Store，也可以使用 TestFlight；只有需要公司主体名称时才必须使用组织账号。
- 首次构建前执行 `npx eas-cli@latest init`（eas init），由 EAS 将真实 Project ID 写入 app 配置。不得伪造或手填 EAS Project ID。

## 构建前检查

```bash
cd mobile
npm run check:store
npm test
npm run typecheck
npx expo config --type public
```

`preview` profile 已固定为：

- `distribution: internal`
- Android `buildType: apk`
- Android / iOS `image: latest`，满足 Expo GitHub App 网页构建要求
- `EXPO_PUBLIC_API_URL=https://chenju.work`

正式 API 必须是 HTTPS。需要服务端开关的配置，例如 `APP_BILLING_PRODUCT_IDS`、`BILLING_VERIFICATION_URL` 和 `AUTH_SECRET`，必须放在服务器环境，不能写进 App 包。

## Android 内测 APK

首次构建时，EAS 会询问是否生成 Android Keystore。选择由 EAS 管理即可；如果团队已有正式签名，则按现有 Keystore 导入。

```bash
cd mobile
npx eas-cli@latest build --profile preview --platform android
```

构建完成后：

1. 打开 EAS 返回的安装链接，或在 Android 设备扫描二维码。
2. 确认安装包名称是成剧，桌面图标和启动页正常。
3. 使用邮箱验证码登录，确认能看到 Web 同一账号的项目和额度。
4. 检查相机、相册、通知、弱网重试和重启后的登录恢复。
5. 在系统设置中确认应用版本和包名均为 `work.chenju.veyaframe`。

Expo GitHub App 的网页构建要求该平台至少成功完成过一次本地 CLI 构建。因此首次 Android 构建必须执行上面的命令；网页上的入门卡片链接只是文档，不是真正的构建入口。首次构建成功后，再到 Expo 项目的 GitHub settings 连接仓库、把 Base directory 设为 `mobile`，之后即可在 Builds 页面点击 `Build from GitHub`。

如果只需要把 APK 发给测试者，可以下载 EAS 构建产物直接安装。若要使用 Google Play 内测轨道，则生产 profile 默认产出 AAB，并通过 `eas submit` 上传。

## iOS 真机内测

iOS 的 internal distribution 是 ad hoc 安装，不等同于 TestFlight。先登记测试设备：

```bash
cd mobile
npx eas-cli@latest device:create
npx eas-cli@latest build --profile preview --platform ios
```

EAS 会要求 Apple 登录、Bundle ID `work.chenju.veyaframe`、分发证书和 Provisioning Profile。测试设备必须已加入该 Profile，否则安装会失败。安装链接只能在已登记设备打开。

## TestFlight

TestFlight 使用 App Store 分发构建，不走 preview APK 流程。先在 App Store Connect 创建 App 记录，再构建 production profile：

```bash
cd mobile
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --profile production --platform ios
```

首次提交需要：

- App Store Connect App 已创建，Bundle ID 与 `app.json` 一致。
- Apple 分发证书和 Provisioning Profile。
- App Store Connect API Key，或按 EAS 提示登录 Apple。
- 隐私政策、支持地址、审核备注和测试账号。
- 如使用推送，配置 APNs Key、EAS Project ID 和 `expo-notifications` 凭据。

提交后进入 App Store Connect 的 TestFlight 页面，完成合规信息并邀请测试者。内部测试通常无需完整审核；外部测试仍需要 Apple 审核。代码侧配置完成不等于 TestFlight 已上传或已通过。

## Android Play 内测

```bash
cd mobile
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --profile production --platform android
```

在 Play Console 选择内部测试或封闭测试轨道，配置测试者列表和商店资料。首次上传必须启用 Play App Signing，并确认包名 `work.chenju.veyaframe`。

## 推送和 App 标识

- 推送必须使用真实 EAS Project ID，不能用占位符。
- Android 需要 FCM 凭据，iOS 需要 APNs Key。
- 推送 Token 注册成功只代表设备已取到 Token，不代表通知已达；必须用真机锁屏测试。
- 应用备案号、ICP 备案号和生成式 AI 相关材料必须由运营主体补齐，不能由构建脚本生成。

## 已知本机限制

当前 Windows 开发机没有 `eas` CLI、`adb`、Android Emulator 或 Xcode。可以完成配置检查和 JS/Expo 构建验证，但不能在本机完成 iOS 签名、TestFlight 上传或 Android 真机安装。实际构建必须在已登录 Expo、Apple 和 Google 账号的环境执行。
