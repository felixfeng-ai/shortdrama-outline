# 移动端 App 外壳

## 1. 目标

让安装后的 PWA 从「手机上的缩略工作台」变成可日常使用的 App 首页：
默认进入场记，能在四种高频场景之间切换，并复用现有项目、任务、额度和 Agent 能力。

## 2. 边界

- 只在 `max-width: 920px` 且 URL 带合法 `app` 参数时启用 App 外壳。
- 普通手机浏览器访问 `/`、桌面端和既有 `?step=` 深链接仍进入六步工作台。
- 不复制 Agent、项目、生成任务和额度的业务逻辑；App 外壳只负责组合与导航。
- App 专属布局和交互不得改变 Web 桌面工作台。
- App 外壳不新增自动模型请求，不因切换页签消耗额度。

## 3. 能力与场景

### A1 App 启动

**Requirement**：安装后的 PWA 默认打开 App 首页。

**Scenario A1.1**
Given 用户从已安装的 PWA 图标启动
When 应用读取启动地址
Then Manifest 的 `start_url` 为 `/?app=agent`，默认显示场记页签。

**Scenario A1.2**
Given 手机宽度不超过 920px 且 URL 为 `/?app=projects`
When 页面初始化
Then 显示 App 外壳并选中「项目」页签。

**Scenario A1.3**
Given URL 没有 `app` 参数，或参数不是四个合法页签之一
When 页面初始化
Then 保持现有六步工作台，不出现 App 底部导航。

### A2 四入口导航

**Requirement**：App 外壳提供 Agent、项目、任务、我的四个固定入口。

**Scenario A2.1**
Given App 外壳已显示
Then 底部导航包含四个带图标和文字标签的按钮，当前页签有明确的 `aria-current` 状态。

**Scenario A2.2**
Given 用户点击任一入口
Then URL 更新为对应 `app` 参数，并保留 `step`、`theme` 等其他查询参数。

**Scenario A2.3**
Given 手机有底部安全区
Then 导航和页面滚动内容都避开安全区，内容不能被导航遮挡。

### A3 场记首页

**Requirement**：场记是 App 默认首页，并复用现有 Agent 会话。

**Scenario A3.1**
Given 当前已有项目
When 打开场记页签
Then 显示项目名、当前步骤和进度，并使用现有 `AgentDock` 真实对话与工具。

**Scenario A3.2**
Given 用户从场记切到其他页签再回来
Then 已有会话和滚动位置不丢失。

**Scenario A3.3**
Given 用户只打开场记页签
Then 不自动发送问题、不发起 `/api/agent` 请求、不扣额度。

### A4 项目切换

**Requirement**：项目页用于巡视和切换当前项目。

**Scenario A4.1**
Given 匿名会话下存在多个项目
When 打开项目页签
Then 按最近更新排序展示项目名、更新时间与当前标记。

**Scenario A4.2**
Given 用户点击非当前项目
Then 复用现有项目恢复链路加载该项目，且不会把上一项目的产物串进来。

**Scenario A4.3**
Given 用户点击新建或载入示例
Then 分别复用现有新建与示例项目链路，成功后仍停在 App 外壳内。

**Scenario A4.4**
Given 用户点击「进入工作台」
Then 移除 `app` 参数并显示现有六步工作台。

### A5 任务与我的

**Requirement**：任务和我的页签复用现有真实状态，不做静态占位。

**Scenario A5.1**
Given 当前项目有生成任务
When 打开任务页签
Then 使用现有 `GenerationTaskPanel` 展示任务并可重试。

**Scenario A5.2**
Given 用户打开我的页签
Then 显示真实额度、安装入口、匿名会话与本地存储边界。

## 4. 验收

- URL 解析、构造和 Manifest 启动地址有单元测试。
- 页面选择 App 外壳与四入口有回归测试。
- Agent、项目、任务、额度均复用现有组件或状态，不出现第二套逻辑。
- 在 390×844、375×812 和横屏视口验证无横向溢出、无内容被底部导航遮挡。
- 验证触控目标不小于 44px、焦点可见、`prefers-reduced-motion` 生效。
- 全量测试、类型检查与生产构建通过。
