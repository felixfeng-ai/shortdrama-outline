# 可收起 Veya Agent 工作舱

## 目标

Agent 是创作过程中的辅助协作面，不应在桌面永久占用 360–400px 宽度。默认收起为可识别的 Veya 图标，按需展开浮层工作舱，让分镜、时间线和项目内容获得完整工作面。

## Requirement 1：桌面默认收起

### Scenario A1

Given 用户使用宽度大于 920px 的桌面或平板
When 打开工作台
Then Agent 工作舱默认关闭
And 主工作面占据侧栏之外的完整宽度
And 页面右侧保留一个 56px 的 Veya Agent 图标

### Scenario A2

Given 用户有未读 Agent 消息
Then 图标显示数量角标
And 角标超过 9 条时显示 `9+`

## Requirement 2：点击展开浮层侧舱

### Scenario A3

Given Agent 工作舱处于收起状态
When 用户点击 Veya 图标
Then 侧舱从右侧展开为浮层
And 展开动作不改变主工作面宽度
And 原有三类内容继续可用：镜头预览、Veya Agent、镜头属性

### Scenario A4

Given Agent 工作舱已展开
When 用户再次点击图标或按下 Escape
Then 侧舱收起
And 焦点回到 Veya 图标

### Scenario A5

Given 用户打开或关闭侧舱
Then 动画只作用于 `transform`、`opacity` 和可见性
And `prefers-reduced-motion` 下关闭位移动画

## Requirement 3：移动端保持底部抽屉

### Scenario A6

Given 页面宽度不超过 920px
Then 桌面悬浮 Veya 图标隐藏
And 现有底部抽屉抓手继续负责展开与收起
And 页面没有横向溢出

## Requirement 4：可访问性

- Veya 图标是原生按钮，触控区域不小于 44px。
- 按钮使用 `aria-expanded`、`aria-controls` 和随状态变化的中文标签。
- 收起时侧舱内容不可见且不可聚焦。
- 展开时保持可读的焦点轮廓。
