# HANDOFF — 当前进度交接说明

> 本文件用于 Codex 新会话无缝接续工作。请先完整读取本文件，再结合 `git status` 和项目代码确认状态后继续。

## 项目
- 路径：`D:\Project\drama-outline`
- 类型：Next.js 短剧大纲创作工具（App Router + Tailwind），面向竖屏短剧与漫剧

## 当前状态（2026-10-15 凌晨）
**纸墨主题 + demo 外壳 + AI 助手已全部落地，本地验证通过，等待推送部署。**

### 一、外壳与视觉（对齐 `.tmp-visual3/demo.html`）
- demo 的 `style.css` 已原样移植进 [app/globals.css](app/globals.css)（`.topbar / .navpanel / .compose / .chip / .bmain / .ask / .cinema / .specs` 等同名同值），组件直接用这些类，两边改一处即同步
- 顶栏：衬线「成剧」+ AI 徽标在左；右上角沿用**线上那版**（三条硬指标 + GitHub 入口，不是 demo 的齿轮/头像——用户明确要求与线上一致）
- 左栏六步导航：圆角面板、图标 + 名称，三条状态各自的表达方式——正在看 = 浅玫底 + 左侧朱砂竖条 + 朱砂文字；已完成 = 暖赭图标文字 + 极淡赭底（**不用勾**，用户否掉了勾的两种摆法）；未开始 = 墨色。注意：状态色写在 CSS 的 `.on / .done` 里，不能用 Tailwind 工具类——`.navpanel button` 的选择器权重比工具类高，会被盖掉（真实踩过）
- **一页只显示一步**（`StepSection` 新增 `visible`，左栏/窄屏步骤条切换 `view`），生成状态都在页面级，切换不打断任务；每步完成后面板底部出现「下一步提示」（主线下一站 + 顺带解锁的资产步骤，如角色生成完 → 去定妆）
- 顶部与左栏**吸顶**：`header` 用 `sticky top-0`，左栏与输入卡是「外层 grid item 撑满整行 + 内层 sticky」才有效（直接给 grid item 加 sticky 无效）
- 放映厅（AI 提问条 + 分镜视觉面板）在 `xl` 起**脱离文档流固定在右下角**，进页面第一屏可见；右栏底部留 420px 空白保证内容不被永久遮挡；窄屏回到流内
- mid 三处刻意的取舍：题材标签首屏只放 demo 那六个（其余收进「更多题材」，选中或 AI 推荐时会自动展开）

### 二、AI 助手（真功能，不是装饰）
- 新增 [app/api/assistant/route.ts](app/api/assistant/route.ts) + [lib/assistant.ts](lib/assistant.ts)：带着**当前这一镜**的完整上下文（场景/动作/景别/运镜/画幅/时长/已有英文提示词/角色锚点/题材）提问，返回可直接写回的文本
- 界面 [components/AssistantDock.tsx](components/AssistantDock.tsx)：提问条 + 「应用到本镜提示词 / 本镜动作」；没有选中镜头时占位文案会换成「比如：这个开场怎么更抓人…」，不承诺润色分镜
- 额度按 `STEP_COST.assistant = 1` 计费；回答解析做了兜底（字段名飘、非法 applyTarget、none 时多余的 newText 一律丢掉——后者最危险，会覆盖用户提示词）
- 分镜视觉面板显示**当前镜**的 9:16 缩略图（走 `getPreviewUrl`，本地 blob，像素不出门）与四行参数：镜头 / 景别 / 画幅 / 时长（与 demo 同构）

### 三、景别与运镜拆开（会污染出图提示词的字段）
- `SHOT_SIZES`（特写/近景/中景/全景/远景）与 `CAMERA_MOVES`（固定/推/拉/摇/移/跟随）现在是两个字段：`Shot.shotSize` + `Shot.camera`
- 同步改了 `normalize`（含**旧数据迁移**：历史项目把景别写在 camera 里会自动挪进 shotSize）、`prompts`（模型 JSON 模板拆两个字段并禁止互相顶替）、`export`（执行单/CSV/离线 HTML 都加景别列）、`ShotCard`（两个下拉）、助手上下文

### 四、额度的两个修复
- **按北京时间切日**：原来用 `toISOString()` 切 UTC 日，北京凌晨 0-8 点看到的还是昨天的账、文案却写「明天恢复」。现在钉死 `Asia/Shanghai`（可用 `CHENGJU_TZ` 覆盖），有 `Q0 / Q14` 两条测试盯着跨日那一刻
- **每人每天 5 个完整项目**（65 单位，原 26）：一条完整流程 13 单位，2 个项目重跑两次就见底。全站熔断仍是 3900 单位/天（≈300 个项目），要放宽改 `CHENGJU_DAILY_UNITS_GLOBAL`
- 文案：余量不足一个完整项目时显示「还能跑几步（不够一个完整项目）」，不再显示容易误读的「可跑 0 个完整项目」；单位明细收进悬浮提示

### 五、「AI推荐」角标做成了真的
- 联想想法那一次调用（不额外花钱）会让模型从真实题材清单里挑 1-3 个 id；[lib/prompts.ts](lib/prompts.ts) 的 `readRecommendedGenres` 只认清单里存在的 id、去重、最多三个
- 界面角标只认这份结果：联想前 0 个角标；推荐到「更多题材」里的项会**自动展开**那一行

## 验证状态
- `npm test` **150 项全过**（新增：助手 9 条、题材推荐 4 条、左栏导航 3 条、跨日 2 条、景别迁移 1 条）
- `npx tsc --noEmit` 干净；`npm run build` 成功
- DOM 体检（不截图）：零绿相、无横向溢出、无控制台报错、放映厅首屏可见、单步视图切换正确
- 真链路实测：联想返回 `["suspense","urban"]` → 角标只落在「都市/悬疑」；助手带镜头上下文提问能返回可写回文本

## 视觉方向（用户已确认）
**参考图 = `concept-reference.png`**（2048×2048，1024pt 设计 2x 渲染）。除它以外**禁止读取任何图片**（曾有会话读 3 张截图把上下文撑到 131 万 tokens 直接 400）。核对质感只看这一张，或用浏览器打开 `.tmp-visual3/demo.html`。

| 项 | 规格 |
|---|---|
| 基底 | 暖米纸 `#EFE5D7`（颗粒 + 亚麻织纹 + 四角微暗），禁纯白 |
| 强调色 | 幕布红/朱砂 `#A3252A`~`#C0303A` 唯一强调色；完成态走暖赭 `done-*`，禁绿、禁金铺满 |
| 字体 | 标题/品牌衬线（Georgia / Songti SC），正文无衬线 |
| 圆角 | 卡片 14px、内嵌块 12px、徽标 8px、胶囊全圆 |

## 部署
- push 到 `main` → GitHub Actions（`.github/workflows/deploy.yml`）SSH 到服务器执行 `/opt/chengju/deploy/cicd-deploy.sh`
- 需要仓库 secrets：`CHENGJU_HOST`、`CHENGJU_SSH_KEY`；服务器侧 PM2 进程 `chengju`、端口 3001、资产库在 `/opt/chengju/data`

## 剩余待办
1. 清理临时产物：`.tmp-*.cjs/mjs`、`.tmp-shot-*.png`、`.tmp-visual*`、`.tmp-visual3-backup/`（`.gitignore` 已忽略，不影响仓库）
2. 可选：`VisualAnchorPanel` / `AttachReview` 的完成态目前是暖赭，嫌不够醒目可换朱砂
3. 可选：窄屏步骤条（`StepIndicator`）还没换成左栏那套「浅玫胶囊 + 暖赭完成态」
4. 可选：全站熔断阈值按实际用户量再调

## 本地跑法
- 开发：`npm run dev`；生产预览：`npm run build && node node_modules/next/dist/bin/next start -p 3199`
- 本地额度不够时在 `.env.local` 加 `CHENGJU_DAILY_UNITS=130`（= 10 个完整项目）
- 查额度流水：读 `data/chengju.db` 的 `usage_log`（按 identity + step + day 分组）
