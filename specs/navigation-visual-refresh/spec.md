# 导航与顶栏视觉刷新

## 目标

让桌面导航从紧凑图标轨升级为可扫读的工作目录，减少顶栏和菜单里连续的描边按钮，使界面更像一个创作工作台，而不是传统后台工具栏。

## Requirement 1：桌面顶栏只承担全局状态

### Scenario N1

Given 用户在大屏桌面打开工作台
When 页面显示宽度不小于 1360px
Then “画布 / 创作技能 / 教程”从顶栏移入左侧导航
And 顶栏保留品牌、项目额度、运行状态、安装/通知、账号和更新入口

### Scenario N2

Given 顶栏出现操作按钮
Then 默认状态不显示高对比描边
And hover、focus-visible 和运行状态仍清晰可辨

## Requirement 2：桌面侧栏成为完整导航目录

### Scenario N3

Given 用户在大屏桌面
Then 品牌位于全高侧栏顶部
And 左侧显示完整文字导航，不再只显示两字缩写
And 工作区入口位于“画布 / 创作技能 / 教程”
And 六步流程只在文本层与资产层之间保留一条分组线

### Scenario N4

Given 用户查看侧栏菜单
Then 品牌、入口和六步名称共用统一无衬线字体体系
And 普通菜单正文为 15px，图标为 22px
And 当前项使用浅灰整行填充，图标与文字均保持白色

### Scenario N5

Given 某一步是当前步骤
Then 使用整行浅填充和图标强调
And 不使用亮色大底、左侧竖线或高对比硬边框

### Scenario N6

Given 某项已完成或不可达
Then 完成态只用一个冷蓝小点提示，不可达态降低透明度
And 状态不能只靠颜色表达，仍保留可读文字和可访问名称

## Requirement 3：响应式与操作尺寸

### Scenario N7

Given 页面宽度在 921px 到 1359px
Then 左侧导航收为图标轨，顶栏恢复快捷入口

### Scenario N8

Given 页面宽度不超过 920px
Then 左侧导航隐藏，六步继续使用顶部胶囊
And 页面没有横向溢出

### Scenario N9

Given 用户使用键盘或触屏
Then 菜单项具有清晰焦点
And 触屏可点击区域不小于 44px

## 视觉约束

- 继续使用 Signal Desk 的石墨底、鼠尾草绿和冷蓝语义。
- 分组只使用极淡发丝线，不使用卡片式菜单边框。
- 大屏菜单项正文不小于 15px，图标不小于 22px。
- 动画只服务状态反馈，并遵守 `prefers-reduced-motion`。
