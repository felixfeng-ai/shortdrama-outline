# App 深链接

## 1. 目标

让六个工作步骤可以通过 URL 直接打开，支持刷新恢复、浏览器前进后退和 PWA 快捷方式。

## 2. 边界

- URL 只包含步骤，不包含项目正文、角色、Prompt 或任何项目内容。
- 项目权限仍由匿名会话 Cookie 控制。
- 非法步骤回落到默认“核心人物”，不报错。
- 保留现有 `theme` 等其他查询参数。

## 3. 场景

### D1 URL 读取

**Scenario D1.1**
Given URL 为 `/?step=visuals`
When 页面初始化
Then 直接显示“视觉定妆”。

**Scenario D1.2**
Given URL 的 step 不在六个合法值内
Then 使用默认步骤，不写入项目内容。

### D2 步骤切换

**Scenario D2.1**
Given 用户点击左侧步骤或“下一步”
When 视图切换
Then 更新 URL 的 `step`，保留 `theme` 等其他参数。

**Scenario D2.2**
Given 用户点击浏览器后退或前进
Then 页面跟随 URL 切换步骤，不重新生成内容。

### D3 PWA 快捷方式

**Scenario D3.1**
Given 用户长按已安装的成剧图标
Then 可快捷打开核心人物、视觉定妆或分镜。

## 4. 验收

- URL 解析与构造有单元测试。
- PWA Manifest 包含步骤快捷方式。
- 浏览器刷新与历史前进后退通过真实页面验证。
