# HANDOFF — 当前进度交接说明

> 本文件用于 Codex 新会话无缝接续工作。请先完整读取本文件，再结合 `git status` 和项目代码确认状态后继续。

## 项目
- 路径：`D:\Project\drama-outline`
- 类型：Next.js 短剧大纲创作工具（App Router + Tailwind），面向竖屏短剧与漫剧

## 当前状态（2026-10-14 晚）
**纸墨视觉已落地到代码，不再是预览稿。**
- 主题 token 全量换血：`tailwind.config.ts`（surface=米纸 / ink=暖褐 / accent=幕布红 / done=暖赭 / cinema+gold=放映厅）+ `app/globals.css`（纸纹底、`.btn-primary`、`.ai-badge`、`.tag-ai`、`.ai-status`、`.darkroom`）
- 组件已统一：`ShotCard`（参数行改成深棕黑「分镜视觉」参数条 + 浅金数值）、`IdeaPanel`（主按钮红渐变+星芒、AI 候选前两条挂「AI推荐」角标、题材胶囊）、`SideNav`（选中态=浅玫底+朱砂左条）、`StepSection`（AI 生成中流光条 + 主按钮统一）、`QuotaBar`（三档只剩朱砂深浅）、其余组件走批量 token 迁移（green/emerald/slate/amber/rose/red 全部退场）
- `app/page.tsx` 顶部改成一层楼高的品牌栏（衬线「成剧」+ AI 徽标 + 三条硬指标 + 自建入口），替换原来的居中 hero
- `app/icon.svg`：补 favicon，消掉 `/favicon.ico` 404
- 验证：`npm test` 130/130 通过；`npx tsc --noEmit` 干净；`npm run build` 成功；生产服务下 DOM 体检（1440×900 与 390×844）零绿相、无纯白面板、无横向溢出、控制台无报错

## 视觉方向（用户已确认，务必按此实现）
**⚠️ 视觉参考图 = `D:\Project\drama-outline\concept-reference.png`**（2048×2048，1024pt 设计按 2x 渲染）
- 需要核对质感时看这一张；**除它以外禁止读取任何图片**（曾有会话读 3 张截图把上下文撑到 131 万 tokens 直接 400）
- 复刻要点：参考它的布局比例、配色、字体气质、留白与红色点缀方式

| 项 | 规格 |
|---|---|
| 基底 | 暖米纸 `#EFE5D7`（颗粒 + 亚麻织纹 + 四角微暗），浅色占七成，禁纯白 |
| 强调色 | 幕布红/朱砂 `#A3252A`~`#C0303A`，全站唯一强调色；完成态走暖赭 `done-*`，禁绿、禁金铺满 |
| 布局 | 顶部品牌栏 → 左侧六步导航（核心人物/三幕大纲/分集剧情/定妆/场景/分镜）→ 中间故事输入 + 灵感标签 + 生成按钮 → 右侧大纲与分集 |
| 分镜视觉 | 深棕黑面板：9:16 缩略图 + 参数行（镜头/景别/画幅 9:16/时长 5s），参数值浅金 `#D9BE8A` |
| 字体 | 标题/品牌衬线（Georgia/Songti SC），正文无衬线 |
| 圆角 | 卡片 14px、内嵌块 12px、徽标 8px、胶囊走全圆 |

**AI 感点缀（5 处，克制）**
1. 品牌区：衬线「成剧」旁的深红 AI 徽标（`.ai-badge`）
2. 生成按钮：红→深红渐变 + 极淡光晕 + 星芒（`.btn-primary`）
3. 灵感标签：AI 联想候选的前两条挂红色「AI推荐」角标（`.tag-ai`）
4. 生成状态：生成中显示半透明浅红流光条（`.ai-status`，动画 `sweep`）
5. AI 助手行：提问条（米白底浅红边 + 红色圆形发送按钮）

**本轮定下的三处口径**（与旧文字不同，已按平台实际情况收敛）
- 面板名用「分镜视觉」（参考图文案，且产品第六步就叫「分镜」；全仓无「放映厅」一词）
- AI 推荐角标只给 AI 联想出来的候选前两条，不挂在固定示例想法/用户自选题材上（那两个类目不是 AI 产出，挂角标会撒谎）
- 缩略图不引外部图片：真实运行时这一格永远来自用户本地素材库（「图不上传」），预览/实现里用 CSS 画暗夜画面占位

## 题材词表（GENRES）
现在共 12 条：不限 / 都市 / 情感 / 职场 / 悬疑 / 家庭 / 逆袭复仇 / 古装 / 甜宠 / 重生穿越 / 玄幻修仙 / 奇幻设定。
本轮补的 4 条（古装·甜宠 补短剧缺口，重生生穿越·玄幻修仙 补漫剧缺口）都写了 `hint`，会被 `genreClause()` 注入每一步 prompt。

## 部署
- push 到 `main` → GitHub Actions（`.github/workflows/deploy.yml`）SSH 到服务器执行 `/opt/chengju/deploy/cicd-deploy.sh`
- 需要仓库 secrets：`CHENGJU_HOST`、`CHENGJU_SSH_KEY`
- 服务器侧：`/opt/chengju`、PM2 进程名 `chengju`、端口 3001、资产库在 `/opt/chengju/data`
- 脚本动作：备份 .env 与 SQLite → `git reset --hard origin/main` → `npm ci` → `npm run build` → `pm2 start ecosystem` → 本地 curl 自检

## 相关产物
- `.tmp-visual3/demo.html` + `style.css`：对齐参考图的静态预览（已在浏览器给用户确认过）
- `.tmp-v3check.cjs` / `.tmp-appcheck.cjs` / `.tmp-btncheck.cjs`：DOM 体检脚本（只看 computedStyle，不截图）
- `.tmp-visual3-backup/`：更早的旧视觉截图（**不要读**）
- `.tmp-*.cjs` / `.tmp-*.mjs` / `.tmp-*.png`：历史临时脚本与截图，`.gitignore` 已忽略

## 剩余待办
1. 清理临时产物：`.tmp-*.cjs`、`.tmp-*.mjs`、`.tmp-shot-*.png`、`.tmp-visual*`、`.tmp-visual3-backup/`（用户确认视觉后可删）
2. 部署后在服务器确认 PM2 与页面自检（`pm2 logs chengju`）
3. 可选：`CharacterThumb`/`AttachReview` 的完成态目前走暖赭，嫌不够醒目可换朱砂
4. 可选：`StepIndicator`（窄屏步骤条）换成与 `SideNav` 一致的浅玫胶囊选中态

## 环境
- Codex 配置：DeepSeek V4 Flash（经 CC Switch 本地代理 `127.0.0.1:15721`）
- 本地跑生产构建：`npm run build && node node_modules/next/dist/bin/next start -p 3199`
