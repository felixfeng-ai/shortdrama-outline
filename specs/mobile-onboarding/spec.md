# App 首次启动引导

## 目标

首次安装或清除本地状态后，App 在进入 Veya Agent 首页前展示一次引导，说明产品价值并给出可执行的开始路径。完成后不再重复打断。

## 能力点

### A1 首次启动判定

**Requirement**：App 根据本地完成标记决定是否展示引导。

**Scenario**：首次启动

- Given 设备上没有有效的引导完成标记
- When 用户打开 App
- Then 在首页前进入 `/onboarding`
- And 系统启动图保持到正确页面就绪

**Scenario**：再次启动

- Given 设备上存在当前版本的完成标记
- When 用户打开 App
- Then 直接进入 Veya Agent 首页

**Scenario**：存储失败

- Given 本地存储读取失败
- When 用户打开 App
- Then 按首次启动处理，展示引导而不是进入空白页

### A2 引导页

**Requirement**：引导页说明当前平台价值，并提供两条开始路径。

**Scenario**：体验示例

- Given 用户正在查看引导页
- When 用户点击“用示例剧体验”
- Then 写入完成标记
- And 进入现有 `/demo` 示例链路

**Scenario**：直接开始

- Given 用户正在查看引导页
- When 用户点击“直接开始”
- Then 写入完成标记
- And 进入项目页

**Scenario**：跳过

- Given 用户正在查看引导页
- When 用户点击“跳过”
- Then 写入完成标记
- And 留在 Veya Agent 首页

### A3 原生 App 约束

**Requirement**：引导页沿用现有 App 设计系统，并适配窄屏。

- 375px 和 390px 下无横向溢出。
- 所有操作目标至少 44×44。
- 使用现有暖白画布、真实分镜组件、Feather 图标和 Veya Agent 名称。
- 不展示“AI 场记”旧名称。

## 验收

- 引导状态逻辑有单元测试。
- 首页入口、引导页和根布局有关键结构回归测试。
- 移动端全量测试和 TypeScript 检查通过。
- 用真实 Expo Web 在 375px 与 390px 截图检查。
