# App 内测构建配置

## 目标

在正式上架前，用同一套 Expo/React Native 代码产出可安装的 Android 内测 APK，以及可验证的 iOS 内测包。构建配置必须连接线上 API，但不把内测构建误称为商店正式发布。

## 能力点

### R1 Android 内测 APK

- `preview` profile 使用 EAS internal distribution。
- Android 明确产出 APK，而不是只产出商店 AAB。
- 安装包使用线上 HTTPS API，不包含 localhost。

### R2 iOS 内测路径

- 已登记测试设备可使用 `preview` profile 的 ad hoc 内测包。
- TestFlight 使用 `production` profile 构建并提交 App Store Connect。
- 两种路径都需要 Apple Developer 证书、Bundle ID 和签名；仓库不能伪造这些凭据。

### R3 可执行门禁

- `check:store` 同时检查生产与预览配置。
- 缺少 EAS Project ID 时，文档要求先执行 `eas init`，不能手填假 ID。
- 文档列出 Android APK、iOS 内测、TestFlight、签名、推送和 API 环境的实际操作步骤。
- 本机无法完成真实签名、TestFlight 上传、真机安装时，必须如实保留为外部阻塞。

## 验收

- 配置单测验证 preview 的 APK、内部发布和线上 API。
- `check:store` 通过。
- Expo config、TypeScript、单测和 web export 通过。
- 不声称已完成 EAS 云端构建、真机安装或商店审核。
