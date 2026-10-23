# PWA 基础

## 1. 目标

让成剧可以作为 PWA 安装到桌面或手机主屏，在网络暂时不可用时仍能显示离线说明，不改变现有业务流程。

## 2. 边界

- 不缓存 `/api/` 请求，不上传、复制或离线保存用户项目内容。
- 不缓存个人图片或生成文件。
- 不强制安装，不弹出打断创作流程的营销弹窗。
- 本轮只做 PWA，不做原生 App。

## 3. 场景

### P1 安装清单

**Scenario P1.1**
Given 浏览器请求 `/manifest.webmanifest`
Then 返回有效名称、短名称、启动地址、standalone 显示模式、主题色和图标。

### P2 安装入口

**Scenario P2.1**
Given Chromium 触发 `beforeinstallprompt`
Then 顶栏出现带下载图标的“安装应用”按钮。

**Scenario P2.2**
Given 浏览器不提供安装事件或应用已安装
Then 按钮不渲染，不占用布局空间。

### P3 离线兜底

**Scenario P3.1**
Given 用户离线后打开一个导航请求
Then Service Worker 返回 `/offline.html`，说明需要联网，并提供重试入口。

### P4 缓存边界

**Scenario P4.1**
Given 请求路径以 `/api/` 开头
Then Service Worker 不拦截、不缓存。

**Scenario P4.2**
Given 请求同源静态资源
Then 使用缓存优先，同时允许网络更新。

## 4. 验收

- Manifest、Service Worker 和安全边界有自动化测试。
- 桌面与移动端安装按钮不重叠。
- 生产构建后 `/manifest.webmanifest`、`/sw.js`、`/offline.html` 可访问。
