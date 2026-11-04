# App Store / Google Play 提交清单

更新：2026-11-04

## 代码内已完成

- 原生 Expo 构建、Bundle ID / Package、URL Scheme、EAS production profile。
- EAS internal preview profile：Android APK、线上 HTTPS API；iOS 可登记设备做 ad hoc 内测。
- 隐私、法律、AI 生成标识和内容举报入口。
- 账号注销、数据导出、设备会话管理。
- 原生通知权限、Token 注册和通知深链。
- Apple / Google 平台内购客户端与服务端交易账本。
- 崩溃边界、页面分析、核心转化事件和用户分析开关。

## 必须由账号持有人完成

- Apple Developer Program、App Store Connect App 记录、证书与 Provisioning Profile。
- Google Play Console App 记录、包名、签名密钥、Play App Signing。
- 在 App Store Connect / Play Console 创建订阅商品，并把 SKU 写入 `APP_BILLING_PRODUCT_IDS`。
- 配置 APNs Key、FCM 项目、EAS Project ID 和设备构建。
- 用真实 iPhone 与 Android 设备完成登录、刷新 Token、通知、相机、麦克风、购买和恢复购买。
- 生成商店要求的 iPhone、iPad、Android 截图；当前仓库截图只用于设计验收。
- 填写年龄分级、隐私营养标签、数据安全表单、审核备注和测试账号。
- 完成 Apple / Google 沙盒购买和退款/恢复测试。

## 发布门禁

```bash
cd mobile
npm run check:store
npx expo-doctor --verbose
npm test
npm run typecheck
npx expo export --platform web
```

以下命令只能在已登录 EAS、Apple 和 Google 账号的机器执行：

```bash
npx eas-cli build --profile production --platform ios
npx eas-cli build --profile production --platform android
npx eas-cli submit --profile production --platform ios
npx eas-cli submit --profile production --platform android
```

Android APK、iOS 真机内测和 TestFlight 的分步操作见
[IOS-TESTFLIGHT-ANDROID-APK.md](./IOS-TESTFLIGHT-ANDROID-APK.md)。
