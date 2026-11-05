# 成剧 VeyaFrame Native

Expo + React Native + TypeScript 原生 App。现有仓库根目录的 Next.js 项目不参与手机客户端运行。

App 与 Web 如何共用项目、快照、会话和写回链路，见 [docs/APP-WEB-DATA.md](../docs/APP-WEB-DATA.md)。
真机、线上接口、命名和上架阻塞见 [docs/APP-STORE-READINESS.md](../docs/APP-STORE-READINESS.md)。

## 当前范围

这是 Expo / React Native 原生客户端，已连接同一账号下的项目、Agent、生成任务、审片资产和订阅核验接口。Web 可视化预览只用于开发检查，不是安装包。

已实现页面：

- 首次启动：Veya Agent 价值页，可进入示例剧或直接开始；完成状态保存在本机
- Agent 首页：当前项目、进度、下一步、运行任务、Veya Agent 与输入区
- 功能地图：从首页“能做什么”进入画面、视频、草片、审片、现场和节奏入口
- 首帧补生成：视频缺首帧时直接复用镜头提示词生成，成功后继续提交视频
- 文生视频兜底：不缺省阻断，用户可选择不补首帧直接生成视频
- Agent 单轮提案：快捷填入、执行状态、停止、依据/影响/成本提案、采用与审片入口
- 真实 Agent 工具循环：同步成功时读取项目快照、执行只读工具并返回待确认建议
- Agent 写回：确认镜头建议后创建新的 `shots` 快照，并检测 Web/其他设备版本冲突
- 邮箱验证码登录：与 Web 共用账号、项目和额度；App 使用 Access/Refresh Token
- 项目页：当前项目、项目列表、导入入口
- 项目管理：原生新建、项目切换、ZIP 项目包导入、示例项目载入
- 任务页：待审关键帧、生成队列、失败恢复提示
- 任务操作：取消排队/运行中的任务，失败或取消后重试
- App 内生成：从角色、地点和镜头目标直接发起关键帧生成
- 项目管理：新建、重命名、删除、切换和 ZIP 导入
- 参考图：相机或相册附件随生成请求提交
- 我的页：登录入口、额度、通知、设备、隐私与 AI 标识
- 审片页：关键帧、版本切换、采用与退回

## 运行

```bash
npm install
npm start
```

本地 Web 预览会读取 `mobile/.env.local` 中的：

```bash
EXPO_PUBLIC_API_URL=http://127.0.0.1:3200
```

真机调试时改成开发机的局域网地址。没有配置或连接失败时，App 会保留本地草稿并显示可重试状态。

## 账号

- Web 与 App 都使用邮箱 6 位验证码登录。
- 原生端用 SecureStore（Keychain / Keystore）保存 Refresh Token。
- Access Token 有效 15 分钟；过期前自动用 Refresh Token 轮换。
- 登录和退出都会重新加载同一账号下的项目。

原生构建需要本机 Android Studio / Xcode：

```bash
npm run android
npm run ios
```

当前开发机没有可用的 Android 模拟器，因此 Web 只用于视觉截图验收：

```bash
npm run web
```

`public/_visual-frame.html` 是开发期手机视口包装页，不是产品入口，也不进入原生安装包。

## 验证

```bash
npm run typecheck
npm test
npx expo export --platform web
```

## 下一步

1. 配置真实 EAS Project ID、APNs/FCM 和商店签名。
2. 在 iPhone / Android 真机完成登录、相机、通知、购买和恢复购买验证。
3. 按 [内测构建说明](../docs/IOS-TESTFLIGHT-ANDROID-APK.md) 产出 Android APK、iOS 内测包或 TestFlight 构建。

