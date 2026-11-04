# 短剧出海本地化控制台

## 1. 背景与目标

成剧已有六步创作、Canon、Skill、版本分支、实体批注、跨项目资产和平台交付。
本能力把“出海”从一次性翻译升级为可追溯的本地化创作：

- 原始中文版本不可被本地化流程覆盖。
- 每个市场/语言使用真实可编辑分支，而不是复制项目。
- 模型负责语义改编，确定性规则负责术语、结构、字幕和 Canon 正确性。
- 所有改动保留来源、原因、市场、版本和影响范围。
- 首期覆盖北美英语、拉美西语和印尼语，不接平台私有上传 API。

## 2. 非目标

- 不做平台界面国际化，前端操作界面继续使用中文。
- 不做机器翻译式的整剧覆盖。
- 不做真实 TTS、口型同步、视频重生成和自动成片。
- 不做海外发行、买量、支付、会员和平台上传。
- 不自动执行文化审查结论，所有语义改写必须由用户确认。

## 3. 全局约束

- 原始版本继续使用 `branch_id = ''`，旧项目、旧快照和旧 API 行为不变。
- 海外分支必须属于同一项目且通过 owner 校验。
- 不同分支的消息、快照、Canon 事实、审计和交付相互隔离。
- 快照版本号仍按 `project_id + kind` 全局递增，避免改变现有版本语义。
- 所有模型写操作只生成待确认结果；用户确认后才保存为分支快照。
- 新增后端模块必须说明事务边界、失败行为和为什么这样设计。
- 不引入新的翻译框架；字幕切分使用 `Intl.Segmenter` 或等价标准能力。

## 4. R1 真实分支与快照隔离

### 能力

- 现有 `project_branches` 从“仅记录基线”升级为可编辑工作分支。
- 分支记录类型、目标市场、语言、源语言、状态和父分支。
- 快照可绑定 `branchId`；不传时等价于原始版本。
- 分支快照可建立跨分支血缘，但不能读取其它分支的正文。

### 场景

#### R1-S1 原始版本兼容

Given 旧项目已有快照且没有 branchId
When 读取该快照
Then 返回 branchId 为空字符串
And 现有六步页面和版本接口行为不变

#### R1-S2 新建海外分支

Given 用户拥有一部项目和一个已落库快照
When 创建类型为 localization、locale 为 en-US 的分支
Then 保存基线快照、目标市场、语言和父来源
And 不复制项目快照或其它分支正文

#### R1-S3 分支隔离

Given 原始分支和 English 分支各有 episodes 快照
When 按 branchId 读取 episodes
Then 只返回该分支快照
And 原始分支的版本顺序不被改变

#### R1-S4 非法基线

Given 快照属于其它项目
When 创建该项目的海外分支
Then 返回输入错误且不写分支

## 5. R2 分支上下文与市场 Profile

### 能力

- 内置 `en-US`、`es-419`、`id-ID` 市场 Profile。
- Profile 包含语言、平台、分级、字幕阅读速度、单行字符、配音语速和制作约束。
- 分支上下文保存用户可覆盖的改编 Brief、平台、评级和备注。
- 上下文使用版本号实现乐观锁。

### 场景

#### R2-S1 Profile 可查询

Given 用户打开海外工作区
When 请求市场 Profile
Then 返回三个内置市场和可编辑默认值

#### R2-S2 保存上下文

Given English 分支
When 用户设置目标平台、受众、文化红线、字幕规则和评级
Then 上下文写入该分支
And 版本号加一

#### R2-S3 乐观锁

Given 上下文当前 version=2
When 用户用 version=1 保存
Then 返回 409
And 不覆盖最新内容

#### R2-S4 非法市场

Given 未注册的 marketCode
When 保存分支上下文
Then 返回输入错误

## 6. R3 Localization Bible 与术语

### 能力

- 分支上下文保存项目级术语表。
- 跨项目资产库扩展 `glossary` 类型。
- 术语包含 source、target、类型、锁定、大小写敏感和备注。
- 锁定术语必须在本地化台词中逐字出现。

### 场景

#### R3-S1 保存术语

Given English 分支
When 用户添加“林远 -> Lin Yuan”锁定术语
Then 术语保存到分支上下文
And 来源和目标不能为空

#### R3-S2 术语去重

Given 已有 source=林远
When 再次保存同一 source
Then 更新原条目而不是新增重复项

#### R3-S3 跨项目复用

Given 用户把术语表保存到资产库
When 打开另一个项目
Then 可把术语表复用到当前分支上下文
And 不携带任何本地图片路径

## 7. R4 分支 Canon

### 能力

- 全球 Canon 继续使用 `canon_facts`。
- 海外分支增加 `project_branch_canon_facts`。
- 审计同时读取全球事实和当前分支事实。
- 同一实体字段在重叠集数内出现不同值时报告冲突。

### 场景

#### R4-S1 保存市场事实

Given English 分支和角色“林远”
When 保存 preferredName=Lin Yuan、集数 1-30
Then 事实只属于 English 分支
And 原始分支查询不到该事实

#### R4-S2 全球事实继承

Given 全球 Canon 规定林远是调查记者
When English 分支没有覆盖该字段
Then 审计使用全球事实

#### R4-S3 冲突报告

Given 全球事实和 English 分支事实在同一集数区间值不同
When 运行分支 Canon 审计
Then 返回 conflict 报告并定位实体、字段和集数

## 8. R5 剧本与台词本地化

### 能力

- 以分集或场次为单位生成本地化改编候选。
- 输入包含原始正文、市场 Profile、改编 Brief、术语和 Canon。
- 输出包含本地化台词、改编原因、风险、术语使用和镜头映射。
- 使用 SSE 分批反馈，可中断和恢复。
- 结果不自动写正式快照，用户确认后保存。

### 场景

#### R5-S1 首批生成

Given English 分支有分集快照和有效上下文
When 用户启动本地化
Then 服务端返回 progress 与 batch 事件
And 每批结果包含 episode、source、localized、reason

#### R5-S2 中断恢复

Given localization_run 已处理到 cursor=2
When 用户继续生成
Then 从 cursor=2 开始
And 输入签名不匹配时拒绝复用旧游标

#### R5-S3 空上下文

Given 分支缺少目标市场或语言
When 启动本地化
Then 返回 400 并说明缺少字段

#### R5-S4 确认写回

Given 用户查看本地化候选
When 点击确认
Then 创建当前分支的新 episodes 或 shots 快照
And 不修改原始分支

## 9. R6 本地化审计

### 能力

- 确定性检查与模型审校分开建模。
- 检查锁定术语、禁用表达、字幕长度、配音时长、Canon、文化风险、视觉文字。
- 每项包含严重度、定位、证据和建议。
- 审计结果保存到分支并可供 Agent/MCP 读取。

### 场景

#### R6-S1 锁定术语错误

Given 术语要求“Lin Yuan”
When 本地化台词写成“Lin”
Then 返回 blocking 的 glossary-miss

#### R6-S2 字幕超长

Given 目标市场单行最多 42 字符
When 一行字幕 60 字符
Then 返回 warning 并给出拆分建议

#### R6-S3 禁用表达

Given 市场红线包含某表达
When 台词命中该表达
Then 返回 blocking 的 banned-expression

#### R6-S4 无问题

Given 术语、字幕、Canon 都满足
When 审计
Then 返回 success 报告且 blocking=0

## 10. R7 字幕、配音稿与本地化交付

### 能力

- 从本地化镜头台词生成 SRT、字幕 CSV、配音稿 CSV。
- 生成术语表、文化说明、视觉本地化清单、平台规格和 manifest。
- 空台词不产生伪造字幕。
- 所有文件为文本，不包含本地参考图片。

### 场景

#### R7-S1 字幕分片

Given 一条长台词
When 生成 SRT
Then 按目标市场字符上限和阅读速度切分
And 时间区间不重叠

#### R7-S2 空台词

Given 镜头没有台词
When 生成字幕和配音稿
Then 不产生该镜头的字幕行
And 视觉镜头仍保留在执行清单

#### R7-S3 Manifest

Given English 分支交付
When 构建交付包
Then schema 为 `chengju.localization-delivery`
And 包含 branchId、market、locale、术语数、字幕数和文件索引

## 11. R8 视觉本地化

### 能力

- 为镜头生成视觉本地化提示词。
- 检测货币、招牌、手机 UI、服装、地点和可读文字风险。
- 默认建议画面中不生成可读文字，改由后期字幕或贴图完成。
- 视觉建议不自动改原 Prompt，用户确认后写入分支 shots。

### 场景

#### R8-S1 文字风险

Given 原 Prompt 要求生成中文招牌
When 运行视觉本地化
Then 报告 readable-text 风险
And 建议改为无文字招牌或后期替换

#### R8-S2 确认写回

Given 用户确认视觉建议
When 保存
Then 只更新当前分支 shots 快照
And 原始 Prompt 不变

## 12. R9 独立本地化工作区

### 能力

- 新路由 `/localize/[projectId]`。
- 桌面为分支轨道、主编辑区、审计/对照侧栏。
- 390px 为纵向布局，不出现横向滚动。
- 不把本地化功能塞入六步首页。

### 场景

#### R9-S1 入口

Given 用户打开项目条或项目总览
When 查看项目操作
Then 有“海外版”入口并保留当前项目参数

#### R9-S2 分段导航

Given 用户打开本地化工作区
Then 可见市场、改编、剧本、术语、字幕、视觉、质检七段
And 当前分支和语言始终可见

#### R9-S3 窄屏

Given 390px 视口
Then 不出现横向滚动
And 主要按钮至少 44px
And 文本不遮挡其它内容

## 13. R10 Agent 与 MCP

### 能力

- Agent 可读取分支、上下文、术语、审计与交付状态。
- Agent 只能生成 `localization-edit` 待确认卡。
- MCP 新增只读分支、上下文和审计摘要工具。

### 场景

#### R10-S1 分支列表

Given 项目有两个本地化分支
When Agent 调用 list_localization_branches
Then 返回 locale、market、status 和基线版本

#### R10-S2 受控修改

Given English 分支第 3 集台词
When Agent 提议修改
Then 生成 localization-edit 卡
And 不直接写快照

#### R10-S3 MCP 只读

Given 外部 Agent 调用 MCP
Then 看不到写入工具
And 项目摘要包含当前本地化分支摘要

## 14. R11 导入导出与兼容

### 能力

- 完整项目备份包含分支、上下文、术语、分支 Canon、运行状态、审计和分支快照。
- 旧项目包没有这些字段时按空实现恢复。
- 导出不包含模型 Key、本地参考图片或其它 owner 数据。

### 场景

#### R11-S1 旧包兼容

Given 导入旧 v2 项目包
When 没有 branches 字段
Then 成功导入并保持原始版本可用

#### R11-S2 往返

Given 项目包含 English 分支
When 导出完整备份再导入
Then 分支、上下文、快照和审计仍可读取

## 15. 验收门禁

- 每个 Requirement 至少一条 RED → GREEN 测试。
- 全量测试通过。
- TypeScript 和 production build 通过。
- 逻辑层覆盖率不低于 80%。
- 1440 和 390 实际截图检查通过。
- 更新 README、DESIGN、JUDGMENT 或 APP 中实际状态。
- 不提交、不部署，除非用户另行确认。
