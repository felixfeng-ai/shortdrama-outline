# 成剧 VeyaFrame Native

成剧是面向短剧与漫剧创作者的轻量 AI 创作 Agent，覆盖从项目理解、分镜生成、低成本草片、现场检查到审片交付的移动工作流。

本仓库当前交付物是 **Expo + React Native 原生 App**，不是 PWA，也不是套壳网页。Web 工作台和 App 共用账号与项目数据，但 App 有独立的原生导航、输入、相机、通知、播放器和商店安装包。

- App 名称：成剧
- Expo 项目：`@felix-ai/veyaframe`
- Expo Project ID：`fd5d8e4e-37c8-4c4f-a8c9-7d0612a5f435`
- Android Package：`work.chenju.veyaframe`
- iOS Bundle ID：`work.chenju.veyaframe`
- 线上 API：<https://chenju.work>

## 产品方向

App 的主界面不是项目管理后台，而是创作 Agent。

- Agent 对话、当前项目上下文和输入区始终是首屏核心。
- 项目、任务和账户是支持页面，不与 Agent 争夺主导航。
- 结果必须落到镜头、任务、资产版本或审片动作，不只返回一段泛化建议。
- 专业时间线、批量翻译和完整 Web 工作台留在 Web，不搬进手机。
- App 的原生优势是相机、相册、语音、通知、视频播放和随身审片。

详细视觉规范见 [mobile/DESIGN.md](mobile/DESIGN.md)。

## 当前能力

### Veya Agent

- 读取当前项目、当前场次、镜头、额度、决策、批注和生成任务。
- 支持真实工具循环、执行状态、停止、失败重试和降级回答。
- 支持镜头建议提案，用户确认后写回新的 `shots` 快照。
- 写回时检测 Web 或其他设备造成的版本冲突，不静默覆盖。
- 视频预算卡展示镜头数、时长、模型、分辨率、预计费用和预算上限。
- Agent 会话通过项目线程同步，本地 SecureStore 作为离线和弱网回退。

### 创作与生成

- 从角色、地点和镜头目标发起关键帧生成。
- 支持已采用首帧生成镜头视频，也支持用户明确选择的文生视频兜底。
- 支持相机、相册和语音输入，参考图通过真实生成接口提交。
- 整集草片优先工作流使用 `MiniMax-H3-Lite / 480P / 5 秒` 低成本检查整集节奏。
- 缺首帧镜头逐镜阻断，不影响同批其他镜头提交。
- 草片按批次展示进度，并进入现有任务中心审片。
- 草片镜头可标记为“需要定稿”，后续再以 768P/2K 出片。

### 制作与审片

- 原生任务中心：等待、运行、成功、失败、取消、停止和重试。
- 图片与视频分别维护采用版本，不互相覆盖。
- 审片页支持版本切换、采用、退回和镜头批注。
- 现场连续性检查：拍摄或选择现场照片，与人物定妆、地点锚点、镜头提示词和 Canon 对照。
- 现场 Take：保存语音转写备注、连续性问题数、好镜标记，并同步到项目级返修队列。
- 视频审片 2.0：时间码批注、截图标记、通过/返修/定稿状态、真实画幅和字幕轨检查。
- 按集节奏分析：开场与结尾钩子、对白密度、平均镜头时长和镜头数量。
- 海外版本只读审片：市场、字幕上限、CPS、平台文化规则和审计问题。

### 账户与项目

- Web 与 App 使用同一套邮箱 6 位验证码登录。
- App 使用 Access Token + Refresh Token，Refresh Token 存在系统 Keychain / Keystore。
- 支持项目切换、新建、重命名、删除、ZIP 导入和示例项目加载。
- 支持额度、订阅恢复、设备会话、导出账号数据、注销账号、隐私与举报入口。
- 支持原生通知、弱网缓存恢复、分享审阅和 iPad / 平板布局。

## 技术栈

| 层 | 技术 |
|---|---|
| 原生运行时 | Expo SDK 58 |
| UI | React Native 0.88、TypeScript、Expo Router |
| 原生能力 | expo-image-picker、expo-video、expo-notifications、expo-secure-store、expo-speech-recognition、expo-iap |
| 状态与同步 | React Context、SecureStore、本地缓存、共享项目 API |
| 服务端 | 现有 Next.js API 服务 |
| 数据库 | 服务端 SQLite，按项目、账号、任务与资产隔离 |
| 图像生成 | 服务端托管阿里云通义万相 |
| 视频生成 | 服务端托管 MiniMax 视频模型 |
| 原生构建 | EAS Build |

App 不包含供应商 API Key。模型、图片、视频和 TTS 调用全部经过服务端鉴权、额度与预算检查。

## 与 Web 共用数据

```text
Web 工作台 ─┐
            ├─ 同一邮箱账号
App         ─┘
                │
                ├─ 项目与最新快照
                ├─ Agent 项目线程
                ├─ 当前采用的图片 / 视频
                ├─ 生成任务与批次
                ├─ 额度与订阅
                ├─ 决策、判断和镜头批注
                └─ 海外分支与审计
```

App 通过 `/api/mobile/context` 读取当前项目的移动端上下文，通过项目快照和写回接口与 Web 保持一致。

数据边界、接口和冲突处理见 [docs/APP-WEB-DATA.md](docs/APP-WEB-DATA.md)。

## 目录结构

```text
.
├─ mobile/                 Expo 原生 App，所有安装包从这里构建
│  ├─ app/                 Expo Router 页面
│  ├─ components/          原生 UI 和业务组件
│  ├─ lib/                 API、状态、同步和测试
│  ├─ constants/           Design tokens
│  ├─ assets/              图标、启动页和字体
│  ├─ scripts/             商店准备检查
│  ├─ app.json             Expo / Android / iOS 配置
│  └─ eas.json             EAS Build 与 Submit 配置
├─ docs/                   App 数据、合规、商店与构建说明
├─ specs/                  移动端功能规格
├─ app/                    Web/API 源码，不进入原生安装包
└─ lib/                    Web/API 与共享契约源码
```

根目录的 `app/` 和 `lib/` 用于 Web/API 与共享接口，不是手机安装包入口。运行或构建 App 必须进入 `mobile/`。

## 本地开发

### 前置条件

- Node.js 20+
- npm
- Android Studio / Android SDK，或 iPhone 真机与 Apple 开发环境
- Expo 账号

### 安装

```powershell
cd D:\Project\drama-outline-app\mobile
npm install
```

配置本地 API：

```powershell
$env:EXPO_PUBLIC_API_URL="http://127.0.0.1:3200"
npx expo start
```

真机调试不能使用 `127.0.0.1`，应改成开发机的局域网地址，例如：

```text
http://192.168.1.10:3200
```

浏览器预览只用于响应式和视觉检查，不是产品交付形态：

```powershell
npm run web
```

## 验证

```powershell
cd D:\Project\drama-outline-app\mobile
npm test
npm run typecheck
npx expo export --platform web
npm run check:store
```

`check:store` 能检查代码和配置，但不能代替：

- Apple / Google 商店签名
- 真机安装
- APNs / FCM 推送
- 商店沙盒购买
- 备案号、ICP 和生成式 AI 材料审核

## 原生打包

### Android 内测 APK

```powershell
cd D:\Project\drama-outline-app\mobile
npx eas-cli@latest build --profile preview --platform android
```

`preview` profile 的配置是：

- `distribution: internal`
- `buildType: apk`
- `EXPO_PUBLIC_API_URL=https://chenju.work`

构建完成后可从 EAS 链接下载 APK，或让 Android 手机扫描二维码安装。

### GitHub 网页一键构建

已完成 GitHub 仓库连接后，在 Expo 项目中选择：

```text
Repository: felixfeng-ai/shortdrama-outline
Base directory: mobile
Git ref: app-dev
Platform: Android
Build profile: preview
Environment: preview
```

不要从 `main` 构建 App。当前移动端代码主要在 `app-dev`，根目录 Web 分支不包含完整 `mobile/`。

### iOS 真机内测

```powershell
npx eas-cli@latest device:create
npx eas-cli@latest build --profile preview --platform ios
```

iOS Ad Hoc 安装要求：

- Apple Developer Program 账号
- 测试设备 UDID 已加入 Provisioning Profile
- 有效分发证书

### TestFlight / App Store

```powershell
npx eas-cli@latest build --profile production --platform ios
npx eas-cli@latest submit --profile production --platform ios
```

首次提交前必须在 App Store Connect 创建应用记录，并补齐隐私政策、支持地址、审核备注、商店截图和合规材料。

完整步骤见：

- [iOS 内测、TestFlight 与 Android APK](docs/IOS-TESTFLIGHT-ANDROID-APK.md)
- [App Store 提交清单](docs/APP-STORE-SUBMISSION.md)
- [App 上架就绪状态](docs/APP-STORE-READINESS.md)
- [中国区合规说明](docs/CHINA-COMPLIANCE.md)

## 发布边界

- Web 部署到 `https://chenju.work` 不等于 App 已发布。
- Expo 构建成功不等于 App Store / Google Play 已通过审核。
- Android APK、iOS Ad Hoc、TestFlight 和生产上架是不同分发路径。
- App 的 API 可以在云端更新，但原生代码、权限、包名和签名变更必须重新构建安装包。
- App 内购买和恢复购买只能在 Apple / Google 沙盒及真实商店环境完成最终验证。

## 相关文档

- [移动端开发说明](mobile/README.md)
- [App 与 Web 数据链路](docs/APP-WEB-DATA.md)
- [原生 App 设计系统](mobile/DESIGN.md)
- [整集草片优先工作流规格](specs/mobile-draft-first/spec.md)
- [App 商店就绪状态](docs/APP-STORE-READINESS.md)
- [App 分享内测指南](docs/INTERNAL-TEST-GUIDE.md)
