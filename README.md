<div align="center">

# 成剧 VeyaFrame

**短剧与漫剧的 AI 分镜台：一句想法，到能出图的分镜提示词**

**VeyaFrame — From one line to a storyboard you can generate.**

独立短剧编剧的 AI 创作与资产工具。**打开网页就用，不装任何东西。**

[![线上体验](https://img.shields.io/badge/🌐_线上体验-chenju.work-2ea44f?style=for-the-badge)](https://chenju.work)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-node%3Atest-2ea44f?style=for-the-badge)](#测试)
[![参考图不上传](https://img.shields.io/badge/本地参考图-不上传-important?style=for-the-badge)](#三条硬指标)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue?style=for-the-badge)](LICENSE)

</div>

---

<div align="center">

```
一句话想法
    │
    ├─ ① 核心人物 ── ② 三幕大纲 ── ③ 分集剧情      ← 创作层：给人看的文本
    │
    └─ ④ 视觉定妆 ── ⑤ 场次剧本 ── ⑥ 分镜提示词    ← 资产层：给出图工具的资产
```

</div>

后三步产出的**不是剧本，是资产**：角色视觉锚点、每场戏的时空、每个镜头的英文提示词。
角色参考图始终存在你自己的硬盘上，**不会上传给成剧图像服务**。
用户点击生成关键帧时，平台服务端使用通义万相新生成图片，并只把生成结果存进当前项目的数据目录。

## 三条硬指标

这个工具只有一个主张：**最轻**。以下三条不是卖点，是可以当场验证的约束。

| | 指标 | 具体到什么程度 | 怎么验 |
|---|---|---|---|
| 🚀 | **零部署** | 从打开 [chenju.work](https://chenju.work) 到拿到第 1 个镜头，**不需要安装任何东西**——不要 Docker、不要本机跑服务；不登录也能开始，登录后项目可跨设备找回 | 打开即用，全程只需一个浏览器 |
| 🔒 | **参考图零上传** | 本地参考图**从不经过服务端**。服务端只存 `vaultKey`（图在你硬盘上的路径）+ `fileHash`（校验指纹），不存这些图的像素 | `/api/refs` 收到带 `data`/`base64`/`file`/`image` 字段的请求会**直接 400 拒绝** |
| 📦 | **零锁定** | 全部资产可一键导出为自包含 zip（含离线分镜表），换工具不用重建 | 「打包带走」按钮会并入本地参考图与当前采用的云端关键帧；历史关键帧保留元数据 |

> 为什么把「零部署」放在第一位：同类开源方案（Jellyfish 等）能力更强，但要走
> Docker + MySQL + Redis，**得先会运维才能开始写剧本**。编剧不该为了用工具先变成工程师。
> 详见下面的[竞争格局](#竞争格局为什么这件事还值得做)。

### 图存在哪

| 浏览器 | 路径 | 说明 |
|---|---|---|
| Chrome / Edge | **目录直连**（File System Access API） | 选一个文件夹当素材库，授权一次，刷新后自动恢复；按目录名自动挂到同名角色 |
| Safari 等 | **浏览器本地存储**（IndexedDB） | 不支持目录 API 时的降级路径，同样不上传 |

两条路径的共同点：**服务端拿不到图片，只有引用和指纹。** ✅

<details>
<summary><b>关于名字</b></summary>

「成剧」既读作「一句话成为一部剧」，也谐音「成句」——产品的输入恰好就是一句话。
短剧这行靠钩子活着，但钩子只有放进完整结构里才成立，所以名字落在「剧」上，不落在「钩」上。

> 线上域名是 `chenju.work`，比品牌拼音少一个 g——`chengju.work` 已被他人注册，
> 退而取了去掉 g 的拼写，读音不变。

</details>

---

## 目录

- [我解决的问题](#我解决的问题)
- [这个工具不做什么](#这个工具不做什么)
- [竞争格局：为什么这件事还值得做](#竞争格局为什么这件事还值得做)
- [为什么选这个方向](#为什么选这个方向)
- [产品设计：为什么分两步、六步](#产品设计为什么分两步六步)
- [快速开始](#快速开始)
- [技术实现](#技术实现)
- [项目结构](#项目结构)
- [接口与数据结构](#接口与数据结构)
- [认证与项目归属](#认证与项目归属)
- [生成任务与恢复](#生成任务与恢复)
- [PWA 与通知](#pwa-与通知)
- [测试](#测试)
- [稳健性与恢复设计](#稳健性与恢复设计)
- [AI 编程怎么参与开发](#ai-编程怎么参与开发)
- [路线图](#路线图)
- [App 产品方向](APP.md)
- [许可证与自建](#许可证与自建)
- [部署](#部署)
- [常见问题](#常见问题)

---

## 我解决的问题

独立短剧编剧（1-3 人小团队）最痛的三个问题：

### 一、有灵感但写不出结构

脑子里有个好点子，但不知道怎么拆成 30 集、60 集。一个想法到一份能开拍的大纲之间，隔着人物、结构、节奏三道坎，很多人卡在第一道就放弃了。

### 二、人物立不住

写着写着人物就崩了，前后矛盾。第 3 集还是精于算计的人，第 7 集突然变成恋爱脑——因为没有一份写死的「动机 + 弧光」在约束后面的剧情。

### 三、每集没钩子

不知道每集结尾怎么留悬念让人想看下一集。短剧是 1-3 分钟一集、靠完播率和追更活着的品类，**没有钩子就没有下一集**。

### 四、有了分镜也出不了图（真正的卡点）

这是独立创作者最实际的一道坎：大纲写完了，接下来要拿即梦/可灵出图，但——

- 每个镜头的提示词得**自己编**，还要保证同一角色在几十个镜头里长得一样
- 角色一多，「这一镜该拿哪几张参考图」全靠记，**双人同框必串脸**
- 换个平台、换个工具，之前攒的角色设定和参考图**全部重建**

市面上的开源方案能解决这个，但**得先会装 Docker、会配数据库**——编剧为了用工具先变成工程师。

**所以成剧做了两件事：**

1. **把创作拆成六步工作流**，每一步单独编辑、单独重生成，人始终保留判断权（而不是一次性吐一大段文本）
2. **把资产层做成本地优先**——角色锚点逐字注入每个镜头提示词保证一致；参考图存在你自己的文件夹，服务端连上传通道都没有

---

## 这个工具不做什么

写清楚边界，比堆功能更能说明它是什么：

| 不做 | 为什么 |
|---|---|
| **不做视频生成 / 一键成片** | 图生视频涉及更高成本、长任务和新的隐私边界；P0 只做到可确认的角色定妆图与镜头首帧 |
| **不把模型部署成本转嫁给编剧** | 关键帧默认由平台通义万相服务生成；用户不需要理解 Provider、模型或 API Key |
| **不做全自动成片** | 那是 [huobao-drama](https://github.com/chatfire-AI/huobao-drama) 的赛道。人在环里才有判断权 |
| **不做团队协作 / 重型账号体系** | 不登录也能开始；手机号账号只负责找回项目和跨端归属，不做组织、成员和权限后台 |
| **不做重部署分发** | 不提供 Docker 镜像——那是 Jellyfish 已经做好的事，我们只提供网页 |
| **不做角色库 / 大纲以外的创作辅助** | 收窄。见[竞争格局](#竞争格局为什么这件事还值得做) |

---

## 竞争格局：为什么这件事还值得做

写这一节是为了避免自我安慰。**分镜、角色一致性、角色资产这套能力，开源社区已经做了，而且做得比我们强。**

> 更细的版本在 [COMPETITION.md](COMPETITION.md)：竞品 issue 里的真实抱怨、用户痛点分层、
> 以及六个值得深耕的方向（结论是「别加面积，加深度」）。

| 项目 | Stars | 形态 | 和我们重叠的部分 |
|---|---|---|---|
| [huobao-drama](https://github.com/chatfire-AI/huobao-drama) | ~16k | 一句话到**成片**全自动 | 不同赛道：它做到视频，我们只到提示词，在它上游 |
| [Jellyfish](https://github.com/Forget-C/Jellyfish) | ~6.7k | Docker 自部署工作台 | **几乎全覆盖**：拆镜头、抽角色/场景/道具、一致性管理、资产复用、批量生成 |
| [drama-skills](https://github.com/zenstory-ai/drama-skills) | ~2.8k | Claude Code / Codex 技能包 | 剧本、角色资产、storyboard、提示词，**且自带跨文档校验脚本** |

Jellyfish 是绕不开的对手：它的 README 明确写了「拆章节剧本为镜头」「抽取角色/场景/道具/服装」「**consistency management**」「资产与实体管理、鼓励复用已有资产」「参考图与视频提示词管理」。这份清单和我们的能力表基本重合。

**所以差异化不在功能清单上，在「谁在维护这套东西」。**

| 维度 | Jellyfish | drama-skills | **成剧** |
|---|---|---|---|
| 部署 | Docker + MySQL + Redis + RustFS，要运维 | 需装 agent 会用 Claude Code | **零部署，浏览器打开就用** |
| 图存哪 | 服务端对象存储（因为要跑视频生成，**必须**托管） | 本地，但需装环境 | **用户自己的文件夹，服务端无上传通道** |
| 面向谁 | 会 Docker 的技术人 | 会用 AI agent 的开发者 | **编剧本人** |
| 强度 | 重（全流程 + 出视频） | 重（十一技能流水线） | **轻（只做资产层）** |

### 一句话说清我们的赌注

> 不是「没人做」，是**已经有人做了，但都做得重**。我们赌的是「轻」这一侧：
> **零部署 + 图在用户自己硬盘 + 用的人是编剧而不是工程师。**

这是一个**更窄**的定位，也确实成立——但风险很明确：

**如果目标用户「编剧」本身就不抗拒装个 Docker，那这个差异化就不存在。**

### 我们主动放弃的东西

放弃是为了守住「轻」：

- ❌ **不做视频生成**——关键帧 P0 先验证一致性、回选与任务状态，图生视频留到下一阶段
- ❌ **不做大纲之外的创作辅助**（角色库、团队协作、组织权限）
- ❌ **不做重部署形态**（不做 Docker 分发、不做服务端存储）
- ❌ **不再加功能**——能力清单已经和 Jellyfish 差不多了，再往上加是拿「轻」去换「全」，必输

---

## 为什么选这个方向

- **短剧是现在 AI 内容创作最成熟的赛道，验证最快**——需求明确、节奏标准、好坏有客观标准（完播率）
- **大纲是创作第一步，也是 AI 最能帮上忙的环节**——大纲对了，后面写正文才不会跑偏；大纲错了，后面写得再顺也是白写
- **不贪多，先把「灵感 → 结构化大纲」这一步做透**

---

## 产品设计：为什么分两步、六步

### 一键生成的大纲，用户不知道从哪改起

让 AI 一口气吐 5000 字大纲，结果是一坨无法下手的文本。用户只有两个选择：全盘接受，或者全部重来。

所以整条链路拆成**两层、六步**，每一步都能单独编辑、单独重新生成：

```
① 核心人物    3-5 个角色：姓名 / 身份 / 性格 / 动机 / 弧光
   ↓  ← 可以改字段、删角色、「换一个」单独重生成
② 三幕大纲    铺垫 / 冲突 / 结局，每幕带关键情节点
   ↓  ← 可以改梗概、增删情节点
③ 分集剧情    N 集（10 / 30 / 60 可选，可自定义 6-120），每集：标题 / 剧情梗概 / 结尾钩子
   ↓  ← 可以改任意一集
──────────  以上是创作层：产出给人看的文本  ──────────
   ↓
④ 视觉定妆    每个角色 6 个视觉字段 + 一段可复用的英文锚点串
   ↓  ← 可以改任意字段，改完能算出影响了哪些镜头
⑤ 场次剧本    把分集拆成「一场戏 = 一个连续时空」的场次
   ↓  ← 一场戏是分镜的输入单位
⑥ 分镜        每镜：场景 / 出场角色 / 动作 / 运镜 / 英文提示词
               并标注「本镜该带哪几张角色参考图」
──────────  以上是资产层：产出给出图工具的提示词  ──────────
复制全部  /  导出 .md  /  打包带走（zip）
```

**这就是创作工具和「聊天机器人」的区别——人始终保留判断权。** 每一小步的结果都摆在台面上，用户改哪一步、重生成哪一步，自己说了算。

**为什么后三步单独算一层**：前三步产出的是「给人读的文本」，后三步产出的是「给机器用的资产」——锚点串要逐字进提示词，镜头参数要直接填进出图平台。两种产物的正确性标准不一样，混在一起讲不清楚，界面上也用不同的颜色区分两层。

**界面是双舱**：左边工作面是暖白底 + 发丝线分隔的连续清单（人物 / 大纲 / 分集都是行，不是一格格卡片），右边产出舱是近墨色面板，里头分「产出 / 场记」两个 tab——分镜视觉和 AI 场记长在同一块深色里。六步用顶部胶囊切换，一页只显示一步；窄屏（≤920px）右舱折成底部抽屉，收起只露一行输入。设计规范见 [DESIGN.md](DESIGN.md)。

**下一步不是加功能，是加判断**：基座模型是公共的，情绪、审美、判断才是差异。判断层（意图卡、双版本选择、Look Book、判断日志、审片人）的目标与路线见 [JUDGMENT.md](JUDGMENT.md)；正确性与交付侧的方向见 [COMPETITION.md](COMPETITION.md)。

### 判断层怎么落地

- **导演意图卡**：核心情绪、目标观众、参考气质和红线，作为人物、三幕、分集、定妆等步骤的统一约束；不填写时不改变旧行为。
- **A/B 选择**：人物、三幕和第一集可以一次生成两个方向，用户选一版并可选填理由；第一集确定后可从第 2 集续写。
- **视觉宪法（Look Book）**：色调、光线、镜头语言和禁用元素逐镜注入分镜提示词，和角色锚点互补。
- **判断日志**：记录“换一个 / 重生成 / 否决”的原因，默认本地保存，只把最近 10 条作为后续生成的上下文。
- **节奏曲线与审片**：每集可标 1-5 强度，曲线用于发现中段塌陷；AI 审片只读诊断钩子和平线，不直接改稿。

产品里有几个细节是围绕「判断权在人」做的：

- **「换一个」**：对某个角色不满意，只换他一个，其余阵容不动（新角色会被要求与现有角色形成新的冲突关系，避免功能重复）
- **过期提示，不自动清空**：改了人物之后，三幕大纲区域会提示「当前大纲基于旧人物生成，建议重新生成」；改了定妆之后，分镜区域同样会提示，但**都不会偷偷清空你已经改好的内容**
- **改一处，算得出影响了谁**：定妆或场次改动后，面板会显示「本次改动影响 N 个下游结果，其中 M 个镜头的提示词已过期」，由血缘图反查得出（见「资产链」一节）

---

## 快速开始

### 方式一：直接用（推荐，零安装）

打开 **<https://chenju.work>** 即可。不需要注册、不需要安装。

### 方式二：本地跑（要改代码 / 离线用）

> 需要 **Node.js ≥ 22.5**（依赖内置的 `node:sqlite`，本地库用的是它，所以零额外依赖）

```bash
git clone https://github.com/felixfeng-ai/shortdrama-outline.git chengju
cd chengju

npm install
cp .env.example .env.local   # 填入 DEEPSEEK_API_KEY
npm run dev                  # → http://localhost:3000
```

```bash
npm test    # 全量 node:test 用例，零测试框架依赖
npm run build
```

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DEEPSEEK_API_KEY` | 是 | — | DeepSeek API Key，在 https://platform.deepseek.com/api_keys 申请 |
| `DEEPSEEK_BASE_URL` | | `https://api.deepseek.com/v1` | 兼容 OpenAI 协议的服务地址 |
| `DEEPSEEK_MODEL` | | `deepseek-chat` | 模型名 |
| `ALIYUN_DASHSCOPE_API_KEY` | 是 | — | 阿里云百炼 Key，仅服务端使用，编剧端无感知 |
| `ALIYUN_IMAGE_MODEL` | | `wanx2.1-t2i-turbo` | 通义万相文生图模型 |
| `ALIYUN_IMAGE_EDIT_MODEL` | | `qwen-image-2.0-pro` | 带项目关键帧参考时的通义多图编辑模型 |
| `WEB_PUSH_PUBLIC_KEY` | 通知功能必填 | — | Web Push VAPID 公钥，可以返回浏览器 |
| `WEB_PUSH_PRIVATE_KEY` | 通知功能必填 | — | Web Push VAPID 私钥，只允许存在服务端 |
| `WEB_PUSH_SUBJECT` | | `mailto:admin@chengju.work` | VAPID 联系主体 |
| `AUTH_SECRET` | 登录功能必填 | — | 验证码散列所需的强随机服务端密钥 |
| `AUTH_ALLOW_DEV_CODE` | | `0` | 仅 localhost 联调时设为 `1` 返回开发验证码；生产域名永远拒绝 |
| `CHENGJU_DATA_DIR` | | `./data` | SQLite 与生成文件的数据目录；生产环境建议放在仓库外 |
| `CHENGJU_GENERATED_DIR` | | `<CHENGJU_DATA_DIR>/generated` | 云端关键帧文件目录 |
| `CHENGJU_CLAIM_LEGACY_PROJECTS` | | 关闭 | 升级后把旧版无 owner 项目认领给首次访问会话时可设为 `1` |

> `.env.local` 已在 `.gitignore` 中，不会被提交。密钥只在服务端使用，前端拿不到。

---

## 技术实现

| | 层 | 选型 | 说明 |
|---|---|---|---|
| ⚛️ | 前端 | Next.js 14 App Router、React 18、TypeScript 5.5、Tailwind CSS 3 | 纯手写样式，没有引入 UI 组件库；支持深色/浅色主题与 PWA 安装 |
| 🔌 | 后端 | Next.js Route Handlers + `middleware.ts` | 全栈一体；中间件负责匿名浏览器会话，业务路由统一读取 owner |
| 🧠 | 文本模型 | DeepSeek（`deepseek-chat`） | OpenAI 兼容协议；结构化 JSON、SSE 流式、function calling |
| 🎨 | 图像模型 | 阿里云通义万相 | 服务端托管密钥；文生图与多图参考编辑，浏览器不接触模型密钥 |
| 🗄️ | 存储 | SQLite + 私有数据目录 | 项目、快照、血缘、图台账、账号、生成任务、关键帧、推送订阅、额度与生成检查点 |
| 🔐 | 账号 | 手机号验证码 + HttpOnly Refresh Session + 15 分钟 Access Token | Web 与 App 共用同一账号和项目归属；App 用短期 Bearer 访问、用 30 天 refresh token 换新 |
| 📲 | PWA / 通知 | Manifest、Service Worker、Web Push、VAPID | 可安装、离线兜底、关键帧完成通知；不缓存 API 和个人图片 |
| 📦 | 依赖 | 框架依赖 + `dotenv`、`web-push` | 功能层没有引入 UI 组件库、ORM、状态库或测试框架；ZIP 打包手写 |

> 当前不再是“零第三方运行时依赖”。准确口径是：**框架之外只保留了部署所需的
> `dotenv` 和 Web Push 所需的 `web-push`，没有引入 UI 组件库、ORM 或状态管理库。**

### 架构总览

```text
浏览器 / PWA / App
├─ React 工作台：六步、项目画布、任务中心、判断层
├─ 本地图库：File System Access API / IndexedDB
├─ AI 场记：前端 ReAct 循环，工具只读或只产出待确认卡片
└─ Service Worker：离线页、安装与通知点击回跳
        │
        ├─ JSON API
        └─ SSE（分集 / 分镜）
                │
Next.js Route Handlers
├─ middleware：匿名会话 Cookie
├─ auth：验证码登录、Web Cookie、App Bearer
├─ 项目归属校验：项目 / 快照 / 任务 / 关键帧 / 推送订阅
├─ DeepSeek：结构化生成、流式生成、工具调用
├─ 通义万相：关键帧任务、轮询、下载与落盘
├─ 生成检查点：长文分批续跑
└─ 推送服务：成功 / 失败通知，失败不影响生成结果
        │
SQLite + 私有数据目录
├─ projects / snapshots / lineage / ref_images
├─ users / login_codes / auth_sessions
├─ generation_tasks / generated_assets
├─ text_generation_checkpoints
├─ push_subscriptions / usage_log
└─ data/generated：仅保存用户主动生成的云端关键帧
```

### 核心数据模型

| 表 / 模块 | 作用 |
|---|---|
| `projects` | 项目标题、所有者、创建与更新时间；所有业务数据都挂在项目下 |
| `snapshots` / `lineage` | 每一步产物的版本、父快照和影响范围；用于过期判断与回溯 |
| `ref_images` | 本地参考图台账，只存 `vaultKey`、SHA-256、归属和元数据 |
| `generation_tasks` / `generated_assets` | 关键帧任务状态、历史版本、采用状态和私有图片文件 |
| `text_generation_checkpoints` | 分集/分镜的输入签名、批次游标、已生成内容和稳定 stamp |
| `users` / `login_codes` / `auth_sessions` | 手机号用户、验证码哈希和可撤销会话 |
| `push_subscriptions` | 当前 owner 的设备推送订阅，endpoint 幂等更新 |
| `usage_log` | 按身份、步骤、日期的额度流水与全站熔断依据 |

**为什么是 DeepSeek**，只看两条：

- **上下文**。第三步的输入是「一句话想法 + 全部角色（每人 6 个字段）+ 三幕大纲（含情节点）」，
  输出是 N 集（10-120 可选）、每集三个字段。这里要防的是**输出被 `max_tokens` 截断、
  JSON 只写了一半**——所以分集按每 10 集一批生成，单批预算随集数增长（封顶 8000），
  后一批带上前文摘要承接；路由的 `maxDuration` 给到 600s（60 集约 6 批）。
- **成本**。一次完整生成（三步全走）在万级 token，按官网单价折下来是分币级别。
  单价低是「入参硬上限」这条敢成立的前提（见「稳健性设计」第 7 条）：
  单次成本压得住，才敢不做限流、只卡单次入参规模。

**没做的事**：没做多模型路由，没给每一步挑不同的模型，没做 RAG。
这个阶段要验证的是「分层工作流」这个产品假设，不是模型能力上限；
每加一层抽象都得有对应的验证收益才值得。

**为什么把模型名抽成配置**：调用走 OpenAI 兼容协议，供应商地址和模型名全在环境变量里。

```bash
# 例如换成火山方舟的豆包，改 .env.local 这两项即可
# 具体服务地址与模型名以火山方舟控制台为准
DEEPSEEK_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
DEEPSEEK_MODEL="<你的推理接入点 ID>"
```

这个决定后来被现实验证了一次：上线后 DeepSeek 官网把 `deepseek-chat` 换成了遗留别名
（当前文档里列的是 `deepseek-flash` 和 `deepseek-v4-pro`），线上暂时还跑得通，
但真要切，改一个环境变量重启即可，代码一行不用动。

### 六个 Prompt

前三个在 `lib/prompts.ts`（创作层），后三个在 `lib/assets/prompts.ts`（资产层）。改提示词不用碰路由和界面代码。

| Prompt | 设计要点 |
|---|---|
| **人物生成** | 要求角色之间有**天然的对立关系**（利益/立场/情感冲突），动机必须能被剧情推动，性格用**行为倾向**描述而不是「善良」「勇敢」这类空词 |
| **三幕大纲** | 按标准三幕结构给每一幕定死功能：第一幕结尾把主角推进无法回头的境地，第二幕中点必须有反转、结尾是最大低谷，第三幕用成长后的方式解决核心矛盾 |
| **分集剧情** | 强调短剧节奏：每集必须有冲突推进、**钩子必须是「未解决的问题」**（新危机爆发/秘密揭开/决定被打断）；冲突强度按选定集数递进：开头抓人、中段升级、末段连续高潮 |

还有一个变体 Prompt 用于「换一个」和「+ 添加角色」——只生成一个角色，并把现有阵容传给模型要求它互补。

判断层不会额外启动一套生成链，而是把结构化上下文注入既有 Prompt：

- 导演意图卡注入人物、三幕、分集等步骤；空表单产生零 prompt 片段，保证与旧行为一致。
- 视觉宪法只注入分镜步骤，和角色锚点互补。
- 第一集 A/B 会额外调用一次；用户选定后才从第 2 集续写。
- 判断日志只取最近 10 条，避免把整段历史塞进上下文。

---

## 项目结构

```
chengju/
├── app/
│   ├── layout.tsx                  # 根布局、字体、元信息、PWA 声明
│   ├── manifest.ts                 # PWA Manifest
│   ├── globals.css                 # Tailwind 入口、Signal Desk 双舱主题
│   ├── page.tsx                    # 工作台状态编排：六步、项目、任务、恢复、判断层
│   └── api/
│       ├── auth/                   # 验证码登录、session、logout
│       ├── characters/             # ① 核心人物
│       ├── acts/                   # ② 三幕大纲
│       ├── episodes/               # ③ 分集：分批、SSE、断点续跑
│       ├── visual/                 # ④ 视觉定妆
│       ├── scenes/                 # ⑤ 场次与地点锚点
│       ├── shots/                  # ⑥ 分镜：按场次分批、SSE、断点续跑
│       ├── projects/               # 项目创建 / 列表 / 改名 / 删除
│       ├── snapshots/              # 快照读取与手工保存
│       ├── impact/                 # 上游改动影响范围
│       ├── refs/                   # 本地参考图台账，只收引用与指纹
│       ├── generations/            # 关键帧任务、历史资产、回选
│       ├── generated-assets/       # 私有生成图片响应
│       ├── push/subscription/      # Web Push 订阅
│       ├── agent/                  # AI 场记的一次模型往返
│       ├── assistant/              # 单镜助手
│       ├── asset-match/            # 无名图片的 AI 认图兜底
│       ├── ideas/                  # 想法联想与题材推荐
│       ├── sample/                 # 示例项目
│       ├── export/                 # 导出清单
│       ├── quota/                  # 额度查询
│       └── health/                 # 健康检查
├── components/
│   ├── SignalOverview.tsx          # 项目状态总览
│   ├── ProjectCanvas.tsx           # 项目画布与搜索/筛选
│   ├── IdeaPanel.tsx               # 想法输入与生成入口
│   ├── StepPills.tsx               # 顶部六步胶囊
│   ├── StepSection.tsx             # 步骤外壳与运行态
│   ├── CharacterList.tsx           # 人物行
│   ├── ActList.tsx                 # 三幕大纲
│   ├── EpisodeList.tsx             # 分集、A/B 与续写
│   ├── SceneList.tsx               # 场次与地点
│   ├── ShotList.tsx / ShotCard.tsx # 分镜卡片、台词、景别、运镜、参考图
│   ├── KeyframePanel.tsx           # 通义关键帧、历史回选、任务状态
│   ├── GenerationTaskPanel.tsx     # 任务中心、单条/批量重试
│   ├── VisualAnchorPanel.tsx       # 定妆与批量出图工具箱
│   ├── BriefCard.tsx               # 导演意图卡
│   ├── LookBookCard.tsx            # 视觉宪法
│   ├── VariantPicker.tsx           # A/B 选择
│   ├── JudgmentLogPanel.tsx        # 判断日志
│   ├── PacingCurve.tsx             # 节奏曲线
│   ├── AgentDock.tsx               # AI 场记
│   ├── VaultPanel.tsx              # 本地图库
│   ├── AuthButton.tsx              # 登录与账号
│   ├── PwaInstallButton.tsx        # PWA 安装入口
│   └── PushNotificationButton.tsx  # 通知开关
├── lib/
│   ├── auth/                       # 验证码、用户、会话、项目认领
│   ├── agent/                      # ReAct 循环、工具 schema、消息协议
│   ├── assets/                     # 资源、锚点、血缘、本地图库、SQLite 读写
│   ├── generation/                 # 通义关键帧、任务、文件、检查点、导出
│   ├── push/                       # 订阅、通知内容、发送与失效清理
│   ├── deepseek.ts                 # JSON / 流式 / 工具调用 / 超时 / 重试
│   ├── partial-json.ts             # 从半截 JSON 中提取已闭合元素
│   ├── prompts.ts                  # 创作层 Prompt
│   ├── brief.ts / look.ts          # 意图卡与视觉宪法
│   ├── pacing.ts / judgment-log.ts # 节奏曲线与判断日志
│   ├── session.ts                  # 匿名会话 owner
│   ├── quota.ts                    # 额度权重、日切与全站熔断
│   └── api.ts / validate.ts        # 统一信封、入参校验、SSE 客户端
├── specs/                          # 能力规格：认证、检查点、任务恢复、PWA、推送等
├── tests/                          # 全量 node:test 回归与协议测试
├── public/                         # sw.js、offline.html、图标等静态资源
├── middleware.ts                   # 匿名会话 Cookie 注入
├── deploy/
│   ├── nginx-chenju.work.conf      # Nginx 站点配置（香港服务器，反代 3001）
│   └── cicd-deploy.sh              # 服务器端部署脚本：停服 → 构建 → 启动
├── .github/workflows/deploy.yml    # push main 自动部署
├── ecosystem.config.cjs            # PM2 进程配置（应用跑在 3001）
└── .env.example                    # 环境变量模板
```

---

## 接口与数据结构

除 SSE 和私有图片响应外，业务接口统一返回信封格式：

```jsonc
// 成功
{ "success": true, "data": { ... }, "error": null }
// 失败
{ "success": false, "data": null, "error": "给用户看的中文提示" }
```

| 方法 | 路径 | 请求体 | 返回 |
|------|------|--------|------|
| POST | `/api/auth/request-code` | `{ phone }` | 发送登录验证码；仅本机开发且显式开启时返回 `devCode` |
| POST | `/api/auth/verify-code` | `{ phone, code, client?, deviceName? }` | Web 设置 HttpOnly Cookie；App 返回 15 分钟 `accessToken` 与 30 天 `refreshToken` |
| GET | `/api/auth/session` | — | `{ user }`；未登录为 `null` |
| POST | `/api/auth/logout` | — | 撤销当前会话并清除 Cookie |
| POST | `/api/auth/refresh` | `{ refreshToken }` | App 换取新的短期 access token，同时轮换 refresh token；旧 refresh token 立即失效 |
| GET | `/api/auth/sessions` | — | 按最后活跃时间返回当前账号的设备会话 |
| DELETE | `/api/auth/sessions` | `{ sessionId }` | 撤销指定设备会话 |
| POST | `/api/ideas` | `{ idea, genre, count? }` | 想法联想与题材推荐 |

登录界面使用独立页面 `/login?next=...`，不从工作台弹出覆盖内容的 modal。`next` 只接受站内路径，登录成功后返回原来的步骤。
| POST | `/api/characters` | `{ idea, mode?, existing? }` | `{ characters: Character[] }` |
| POST | `/api/acts` | `{ idea, characters }` | `{ acts: Act[] }` |
| POST | `/api/episodes` | `{ idea, characters, acts, count, start?, resume? }` | **SSE 事件流**，支持分批与断点续跑 |
| POST | `/api/visual` | `{ projectId?, idea, characters }` | `{ visualCharacters, imagePrompts }` |
| POST | `/api/scenes` | `{ projectId?, idea, characters, episodes }` | `{ scenes: Scene[] }` |
| POST | `/api/shots` | `{ projectId?, idea, characters, acts, scenes, visualCharacters, resume? }` | **SSE 事件流**，按场次分批并保持镜号连续 |
| POST | `/api/assistant` | `{ shot, question }` | 单镜改写建议，可选择应用 |
| POST | `/api/agent` | `{ messages, tools? }` | AI 场记的一次模型往返 |
| POST | `/api/asset-match` | `{ characters, files, genre }` | 文件名到角色的 AI 认图建议，不接收图片 |
| POST | `/api/projects` | `{ title }` | `{ project }` |
| GET | `/api/projects` | — | 当前 owner 可访问的项目 |
| PATCH | `/api/projects` | `{ id, title }` | 项目改名 |
| DELETE | `/api/projects?id=` | — | 删除项目并级联清理快照、任务、台账与文件 |
| GET | `/api/snapshots` | `?projectId=&kind=` | `{ snapshots: Snapshot[] }`（version 倒序） |
| POST | `/api/snapshots` | `{ projectId, kind, payload, parents? }` | 手工保存一版快照并连接血缘 |
| GET | `/api/impact` | `?snapshotId=` | `{ affected: Snapshot[] }`（含多层下游） |
| GET | `/api/refs` | `?projectId=` | `{ refs: RefImageMeta[] }` |
| POST | `/api/refs` | `{ projectId, refs: [{ vaultKey, fileHash, ownerType, ownerId, ... }] }` | `{ refs, saved }`；**带二进制字段直接 400** |
| GET | `/api/generations` | `?projectId=&targetType=&targetId=` | `{ tasks, assets }`；先恢复超时任务，再返回当前 owner 数据 |
| POST | `/api/generations` | `{ projectId, targetType, targetId, prompt, aspect }` | `{ task, asset, referenceCount }`；服务端自动选择项目已采用关键帧，不接受浏览器密钥或模型配置 |
| PATCH | `/api/generations` | `{ projectId, assetId }` | `{ asset }`；在历史关键帧里回选一版 |
| GET | `/api/generated-assets/:id` | — | 私有图片响应；校验项目归属后返回 PNG/JPEG/WebP |
| GET | `/api/push/subscription` | — | 返回 VAPID 公钥与当前设备订阅状态 |
| POST | `/api/push/subscription` | `{ subscription }` | 保存或幂等更新当前设备订阅 |
| DELETE | `/api/push/subscription` | `{ endpoint }` | 关闭当前设备通知 |
| POST | `/api/sample` | — | 创建/载入示例项目，不消耗额度 |
| GET | `/api/export` | `?projectId=` | `{ manifest: { project, latest, refs, exportedAt } }` |
| GET | `/api/quota` | — | 当前身份额度、全站额度与完整项目成本 |
| GET | `/api/health` | — | 服务健康检查 |

`mode` 为 `'single'` 时只生成 1 个角色（用于「换一个」和「添加角色」），此时需要传 `existing` 作为已有阵容，让模型避开功能重复。

### 分集与分镜走 SSE

一次性接口返回 JSON 信封；分集和分镜返回 `text/event-stream`。分集按每 10 集一批，分镜按场次分批，二者都支持中断后续跑：

| 事件 | 载荷 | 说明 |
|------|------|------|
| `episodes` / `shots` | `{ episodes?: Episode[]; shots?: Shot[] }` | 已生成的部分结果，每次都是**全量**，不是增量 |
| `done` | 同对应步骤的全量结果 | 最终结果，以这一份为准 |
| `error` | `{ error: string }` | 生成中途失败，按普通错误提示处理 |
| `resume` | `{ available, cursor }` | 当前请求从检查点恢复，告知下一批起点 |

**为什么每次都推全量**，而不是只推新增的那几集：`normalizeEpisodes` 按数组下标定集数，只喂新增部分的话每批都会从第 1 集重新编号。

**错误分两段**：入参校验失败时流还没建立，返回的仍是普通 JSON 信封（HTTP 4xx）；流已经开始之后才失败，才走 `error` 事件。`lib/api.ts` 的 `postSse` 把这两种情况都归一成抛异常，调用方的 catch 写法和 `postJson` 一致。

**断点续跑**：分集和分镜各自保存一份 checkpoint，记录输入签名、下一批游标、已生成内容和稳定 stamp。只有项目、生成类型和输入签名都一致时才复用；全部成功或用户主动重新生成后，旧 checkpoint 失效。checkpoint 只是恢复机制，不进入正式快照和版本血缘。

```ts
interface Character {
  id: string
  name: string         // 姓名
  identity: string     // 身份
  personality: string  // 性格
  motivation: string   // 核心动机
  arc: string          // 人物弧光
}

interface Act {
  id: string
  key: 'setup' | 'conflict' | 'resolution'
  title: string        // 如「第一幕 · 铺垫」
  summary: string      // 剧情梗概
  beats: string[]      // 关键情节点
}

interface Episode {
  id: string
  number: number       // 集数
  title: string        // 标题
  synopsis: string     // 剧情梗概
  hook: string         // 结尾钩子
}
```

---

## 认证与项目归属

不登录也能完整使用，但匿名数据需要绑定到一个浏览器身份：

- `middleware.ts` 为首次访问设置高熵 `chengju_sid` Cookie；本地开发使用稳定会话，避免重启后项目丢失。
- 手机号登录后，验证码只保存哈希，5 分钟有效，并有发送冷却和小时上限。
- Web 使用 HttpOnly refresh session；App 使用 15 分钟 access token 访问业务接口，过期后用 refresh token 换新。每次刷新都会轮换 refresh token，旧值立即失效。两者读取同一批项目。
- 账号页列出当前账号的活跃设备，可单独撤销其他会话；撤销后对应 access 与 refresh token 都立即失效。
- 首次登录只认领当前匿名会话的项目和推送订阅，不会碰其他匿名会话的数据。
- 项目、快照、关键帧任务、生成资产和推送订阅都按 owner 校验；未登录时 owner 是匿名会话，登录后是用户 id。

当前边界：正式短信通道尚未接入；没有团队成员、组织、角色权限后台；本地图库和相册原图不跨设备同步。

---

## 生成任务与恢复

### 长文生成：checkpoint 续跑

分集和分镜都可能跑几分钟，因此不能只靠一次 HTTP 请求完成：

- 分集每 10 集一批，分镜按场次分批，前一批的摘要会传给下一批。
- 每批成功后写入 `text_generation_checkpoints`，记录输入签名、下一批游标、已生成内容和稳定 stamp。
- 中途失败、取消或连接断开时保留 checkpoint；用户再次点生成时，前端带上 `resume` 标记，从已完成批次之后继续。
- 人物、大纲、场次等输入变化后，签名不一致，旧 checkpoint 自动失效并从头上生成。
- checkpoint 不是正式快照，不参与版本和血缘；正式结果仍只在全部完成后落快照。

### 关键帧任务：状态机与超时恢复

通义关键帧使用 `queued → running → succeeded / failed / canceled` 状态机：

- 生成任务、模型、Prompt hash、参考图数量和输出资产都入库；历史关键帧可以回选和采用。
- 取消只会停止等待，不会把未完成的远端任务写进项目；远端可能仍会完成，文案会明确说明。
- 读取任务列表时会把超过安全时限的 `queued / running` 任务标成失败，避免刷新后永远停在“运行中”。
- 任务中心支持目标去重、单条重试和确认后的串行批量重试。
- 成功和失败都会触发 Web Push；用户主动取消不推送，推送失败不影响生成结果落库。

---

## PWA 与通知

- `manifest.webmanifest`、Service Worker、离线页和六步深链已经接入；可以安装到桌面或主屏。
- Service Worker 不缓存 `/api/`、个人图片或生成资产，只缓存同源静态资源和离线兜底页。
- 通知权限必须由用户点击后请求，不会自动弹窗。
- VAPID 私钥只在服务端；订阅按 owner 保存，endpoint 幂等更新，404/410 会清理失效订阅。
- 通知只包含任务结果和可跳转的步骤，不包含 API Key、Prompt 全文或服务器路径。

---

## 测试

```bash
npm test        # 全量用例，全部通过
```

测试使用 Node 内置的 `node:test`，没有引入 Jest、Vitest 等测试框架。`tests/run.mjs`
统一启动测试进程；`tests/loader.mjs` 补上 Next 的裸模块说明符、`@/` 路径别名和
TypeScript 省略扩展名，所以可以直接测试路由导出函数，不必为了可测性改业务代码。

测试还覆盖测试库隔离和生成目录清理，避免并行测试互相污染。

| 覆盖区域 | 代表用例 |
|---|---|
| 模型协议 | `agent-loop`、`agent-tools`、`agent-wire`、`assistant`、`ideas`、`asset-match` |
| 资产一致性 | `anchors`、`shots`、`place-anchor`、`place-ref`、`auto-attach` |
| 版本与血缘 | `graph`、`impact`、`assets`、`kinds`、`resume` |
| 生成任务 | `generation-api`、`generation-repo`、`generation-checkpoint`、`generation-task-recovery`、`generation-task-center` |
| 关键帧与导出 | `generation-aliyun`、`generation-files`、`generation-export`、`export`、`workorder`、`chaining` |
| 认证与隔离 | `auth-api`、`auth-service`、`auth-ui`、`session`、`project-access`、`projects` |
| PWA 与推送 | `pwa`、`web-push-api`、`web-push-repo`、`web-push-service`、`web-push-ui` |
| 交互与回归 | `step-isolation`、`steps-six`、`signal-desk`、`home-layout`、`canvas-view`、`information-hierarchy` |
| 数据安全 | `refs-export`、`vault`、`test-isolation`、`run-artifacts` |

---

## 稳健性与恢复设计

大模型、长任务和本地资产都不稳定，系统在以下位置做了兜底：

1. **JSON 解析兜底**（`lib/deepseek.ts`）：直接解析 → 去代码围栏 → 截取最外层对象/数组；解析失败会自动重试一次，Key 错误、429、超时这类重试无意义的问题直接返回。
2. **字段整形**（`lib/normalize.ts`）：漏字段、错误枚举、被多包一层的数组、非法集号和镜号都在纯函数层补齐；集数和镜号优先按数组下标重算，不信任模型自报编号。
3. **锚点安全网**：Prompt 禁止模型复述角色外貌，`normalizeShots` 仍会把角色锚点逐字注入；地点锚点只在名称精确命中时注入，宁可没有，也不挂错房间。
4. **token 与批次预算**：场次 16000、分镜按场次分批、分集每 10 集一批。这里踩过真实事故：`maxTokens` 太小会把 JSON 拦腰截断，表现为“模型不听话”，实际是输出预算不足。
5. **SSE 两段式错误**：流建立前失败返回普通 JSON 信封；流建立后失败补发 `error` 事件。响应头带 `X-Accel-Buffering: no`，Nginx 不能压缩 `text/event-stream`。
6. **请求取消与请求纪元**：每个长任务有 `AbortController`；清空、切换项目或重新生成后，旧请求返回的结果按 epoch 丢弃，不会把新页面覆盖回旧内容。
7. **断点续跑**：分集和分镜每批成功后保存 checkpoint；输入签名不一致自动失效，成功完成后清理；用户主动“重新生成”不续跑旧批次。
8. **快照与血缘**：每一步正式产物落快照，下游记录父快照 id；过期不等于清空，影响范围沿血缘反向查询。
9. **关键帧任务恢复**：读取任务列表时把超过安全时限的 queued/running 任务恢复为 failed；活跃任务不误判，终态任务不重复处理。
10. **入参与额度硬上限**（`lib/validate.ts` / `lib/quota.ts`）：想法、人物、三幕、字段长度都有上限；额度在模型调用前检查，按北京时间切日，并有全站熔断。
11. **身份与数据隔离**：匿名会话和登录用户都解析成统一 owner；项目、快照、任务、关键帧和推送订阅按 owner 校验。本地参考图像素不进入服务端。
12. **PWA 与推送边界**：Service Worker 不缓存 `/api/`、个人图片和生成资产；推送订阅只接受 HTTPS 浏览器端点，失效订阅会被清理，推送失败不影响生成结果。

---

## AI 编程怎么参与开发

这个项目的代码**主要由 AI 编程助手完成**，我的工作是定方案、写 Prompt、验收纠偏。

**我定的部分：**

- **产品方案**：为什么拆成两层六步、每步之间靠什么传递上下文、哪些地方必须留人工判断
- **Prompt 设计**：每一步给模型什么角色、什么约束、什么输出格式，全部集中在 `lib/prompts.ts`
- **交互取舍**：上游改了只提示过期、不自动清空下游；生成中允许「清空重来」，用请求纪元把过期响应丢掉

**实现交给 AI，我负责验收。** 需求描述清楚之后，项目搭建、界面、接口调用、状态管理由 Claude Code 一次写出，我在跑通和审查的过程中发现问题再让它改。

**验收中发现并修掉的问题：**

- **Prompt 太泛，人物立不住**：第一版角色动机写出来是「想要成功」这种正确的废话。改法是要求动机必须说明「最想要什么、为什么」，性格必须写成能指导表演的**行为倾向**（「遇事先算成本，被逼到绝路才肯拼命」），而不是形容词
- **模型会用描述性的话糊弄钩子**：分集 Prompt 加了一条硬约束——钩子要写清最后一秒发生了什么，**不许写「留下悬念」「引发观众好奇」这种描述钩子的话**。不写死这条，模型会用一句套话把任务标记成完成
- **上线才暴露的问题**：Nginx 的 `proxy_read_timeout` 默认 60s，小于应用里 240s 的单批模型超时，本地怎么跑都正常、长分集一上线就 504；`git reset --hard` 会覆盖正在执行的部署脚本，所以脚本先把自己复制到 `/tmp` 再 `exec`。
- **批量任务的状态黑洞**：前端刷新后，原来处于 running 的任务会永远显示“运行中”。后来在读取任务列表时加入超时恢复，并让 checkpoint 负责长文续跑，避免重复消耗前几批 token。

**我的判断**：AI 把「写代码」这一步压缩到几乎不花时间，但**需求描述不清、验收不严，出来的就是能跑但不能用的东西**。上面这些问题没有一个是写完就对的——都是我实际跑起来、看到输出不对才回头改的。

---

## 路线图

「已完成」这一栏会越积越长，所以这里只留**还没做**的，以及明确不做的。

| 方向 | 状态 | 说明 |
|---|---|---|
| 角色定妆图 / 镜头首帧 P0 | ✅ 已完成 | 平台托管通义万相；生成任务入库、关键帧历史、采用状态、会话隔离，删除项目时清理文件 |
| 关键帧任务控制 | ✅ 已完成 | 支持停止等待、取消状态和失败重试；取消不会写入关键帧资产 |
| 项目生成任务中心 | ✅ 已完成 | 汇总等待、运行、成功、失败与取消任务；支持目标去重、单条重试和确认后串行批量重试 |
| 生成任务超时恢复 | ✅ 已完成 | 刷新任务列表时把超过安全时限的 queued/running 任务转为 failed；活跃任务和终态任务不误处理 |
| 长剧集分批与断点续跑 | ✅ 已完成 | 分集每 10 集一批，分镜按场次分批；checkpoint 记录输入签名和游标，失败后从下一批继续 |
| PWA 安装基础 | ✅ 已完成 | Manifest、Service Worker、离线兜底、条件安装入口、项目与步骤深链、浏览器历史恢复和分享链接；不缓存 API、个人图片或生成资产 |
| Web Push 生成通知 | 🟡 代码完成，待配置 | 用户授权后推送生成成功/失败，点击回到定妆或分镜；VAPID 私钥只在服务端，生产环境需配置密钥 |
| 手机号账号与项目归属 | 🟡 第二阶段完成 | 验证码登录、HttpOnly Web 会话、15 分钟 App Access Token、30 天 Refresh Session、设备会话撤销与项目认领；正式短信通道与 App 真机联调尚未完成 |
| 本地参考图零上传 | ✅ 保持 | 本地图库原图、路径和二进制不上传；仅使用平台已生成且当前项目已采用的关键帧做一致性参考 |
| 本地图库目录直连 | 🟡 自动化通过 | OPFS 目录句柄已验证扫描、缩略图、中文名自动挂图、刷新恢复、移除/恢复、断开后持久化；真实系统目录授权弹窗仍待人工确认 |
| 可灵首尾帧衔接清单 | 📋 计划中 | **通用版已上线**（导出包的 `chaining.txt` + 「复制衔接清单」按钮，即梦/可灵都适用）；可灵界面特有的字段还没摸清，不凭猜测做 |
| 导出包 schema 版本化 | ✅ 已完成 | `project.json` 带 `schema: chengju.project` 与 `schemaVersion: 1`，未来读取器可按版本兼容旧包 |
| 多项目切换界面 | ✅ 已完成 | 项目条支持新建、切换、重命名、删除与导出备份；未登录按浏览器匿名会话隔离，登录后归属账号 |
| 镜头成本估算 | 🧪 本地实验 | 已实现按可用率、时长、参考图数量估算单镜与整剧成本；尚未进入线上 UI 和正式 Roadmap |
| 多实例与任务队列 | 📋 待做 | 当前 SQLite、额度和检查点仍按单进程设计；扩容前要换 Postgres、队列和 Redis 原子限流 |
| 导出 PDF | 📋 待定 | 目前是 Markdown + 离线 HTML + CSV，PDF 要不要做还没定 |
| LangGraph 重写执行层 | ❌ 不做 | 六步已是可独立重跑的调用，改成图收益不抵复杂度 |
| 本地参考图服务端存储 | ❌ **永不做** | 违反参考图零上传 |
| 云端关键帧存储 | ✅ **只存生成结果** | 用户主动触发通义万相生成后，新图片存入 `CHENGJU_DATA_DIR/generated`；本地参考图仍不进服务端 |

> 「不做」和「永不做」是认真的。这个项目的生存空间在于**窄**，
> 每加一块都是拿「轻」去换「全」，而「全」已经有人做得更好了（见[竞争格局](#竞争格局为什么这件事还值得做)）。

---

## 许可证与自建

### 为什么是 AGPL-3.0

不是随手挑的，和两条硬指标直接相关：

**「本地参考图不上传」这个承诺，只有代码可审计才有意义。** 服务端不接收本地图库参考图像素这件事，
闭源时用户只能选择相信我们；开源后可以直接读 `lib/assets/vault.ts` 和
`app/api/refs/route.ts`，自己确认没有接收图片的通道。

**AGPL 的网络条款挡住「闭源套壳」。** AGPL 第 13 条：通过网络提供服务也构成分发。
谁拿这份代码架站对外服务，就必须公开他的修改。MIT / Apache-2.0 都允许闭源套壳。

> 商标不随许可证授予。「成剧」「chengju」是项目名，改完请换名字。

### 自建（三种方式，按省事程度排）

自建意味着你用自己的 API Key，**不受托管版额度限制**。

#### 方式 A：Node 直接跑（推荐）

> 前置：**Node.js ≥ 22.5**（本地库用的是内置的 `node:sqlite`，所以没有任何
> 需要编译的原生依赖，不需要装数据库）

```bash
git clone https://github.com/felixfeng-ai/shortdrama-outline.git chengju
cd chengju

npm install

# 配置密钥（只填这一项就能跑）
cp .env.example .env.local
# 编辑 .env.local，填入 DEEPSEEK_API_KEY=sk-xxx

npm run dev
# 打开 http://localhost:3000
```

生产模式：

```bash
npm run build
npm start          # 默认 3000 端口
```

#### 方式 B：Docker

```bash
docker build -t chengju .
docker run -d --name chengju \
  -p 3000:3000 \
  -e DEEPSEEK_API_KEY=sk-xxx \
  -v chengju-data:/app/data \
  chengju
```

> `-v` 那个挂载别省：SQLite 库（项目 / 快照 / 血缘 / 额度）就放在 `/app/data`，
> 不挂载的话容器一删数据就没了。

#### 方式 C：PM2 + Nginx（生产）

仓库里带了现成的配置：

```bash
npm run build
pm2 start ecosystem.config.cjs      # 应用跑在 3001（与同机其他服务错开）
```

Nginx 反代配置见 `deploy/nginx-chenju.work.conf`。
**自建到这一步最容易踩的两个坑**（我们都踩过，写在这里免得你再踩一遍）：

1. **`proxy_read_timeout` 必须大于应用的模型超时**。单批模型超时是 240s，
   Nginx 默认只有 60s —— 表现是「本地正常，一上线生成分集就 504」。
   长集数分多批（整条流最长 600s），配置里已给到 660s。
2. **SSE 不能被缓冲**。应用侧在响应头带了 `X-Accel-Buffering: no`，
   Nginx 认这个头，所以配置里不用改。但 **`gzip_types` 里不能加
   `text/event-stream`**，否则流式会被攒成一坨再发，边生成边渲染的效果直接消失。

更详细的部署说明（含 HTTPS 证书、CI 自动部署）在下面的[部署](#部署)一节。

### 环境变量

| 变量 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `DEEPSEEK_API_KEY` | ✅ | — | 模型密钥，自建时用你自己的 |
| `DEEPSEEK_BASE_URL` | | `https://api.deepseek.com/v1` | 兼容 OpenAI 协议的服务地址 |
| `DEEPSEEK_MODEL` | | `deepseek-chat` | 模型名 |
| `ALIYUN_DASHSCOPE_API_KEY` | ✅ | — | 通义万相服务端密钥；浏览器不接触 |
| `ALIYUN_IMAGE_MODEL` | | `wanx2.1-t2i-turbo` | 通义万相模型名 |
| `ALIYUN_IMAGE_EDIT_MODEL` | | `qwen-image-2.0-pro` | 带项目关键帧参考时使用的多图编辑模型 |
| `AUTH_SECRET` | 登录功能必填 | — | 生产环境必须设置强随机值；验证码与散列密钥分离保存 |
| `AUTH_ALLOW_DEV_CODE` | | `0` | 只在 localhost 配合开发验证码；生产域名即使误开也不会生效 |
| `CHENGJU_DATA_DIR` | | `./data` | SQLite 库所在目录（建议放仓库外） |
| `CHENGJU_GENERATED_DIR` | | `<CHENGJU_DATA_DIR>/generated` | 云端关键帧文件目录；仅用户主动生成后写入 |
| `CHENGJU_DAILY_UNITS` | | `65` | 单个身份每天的额度（1 个完整项目 = 13，默认够跑 5 个项目） |
| `CHENGJU_DAILY_UNITS_GLOBAL` | | `3900` | 全站每天熔断阈值（约 300 个项目/天） |
| `CHENGJU_TZ` | | `Asia/Shanghai` | 额度按哪个时区切日（服务器在 UTC 时尤其要留意） |
| `CHENGJU_CLAIM_LEGACY_PROJECTS` | | 关闭 | 升级到匿名会话隔离后，如需把旧版无 owner 项目归给首次访问会话，设为 `1`；localhost 会自动使用稳定开发会话 |

> 额度相关变量只对**托管版**有意义——自建时是你自己的 key，额度限制形同虚设，
> 想关掉就把两个值调到很大。

---

## 部署

生产环境部署在**腾讯云香港轻量服务器**（免备案），PM2 常驻，Nginx 反代。

```
GitHub main ──push──▶ GitHub Actions ──ssh──▶ /opt/chengju/deploy/cicd-deploy.sh
                                                    │
                                       停服 → 拉代码 → 构建 → 启动
                                                    │
                                        PM2: chengju @ 127.0.0.1:3001
                                                    │
                                       Nginx: chenju.work ──443──▶ 公网
```

代码推到 `main` 就自动部署，不需要手动操作服务器。

### 首次部署（一次性，共 7 步）

1. **DNS**：在阿里云控制台给 `chenju.work` 和 `www.chenju.work` 各加一条 A 记录，指向服务器公网 IP
2. **建目录并拉代码**（服务器上执行）
   ```bash
   sudo mkdir -p /opt/chengju && sudo chown "$USER:$USER" /opt/chengju
   git clone https://github.com/felixfeng-ai/shortdrama-outline.git /opt/chengju
   ```
3. **写环境变量**（服务器上，`/opt/chengju/.env`，这个文件不进仓库）
   ```bash
   cd /opt/chengju
   cat > .env <<'EOF'
   DEEPSEEK_API_KEY=sk-你的模型密钥
   ALIYUN_DASHSCOPE_API_KEY=sk-你的通义密钥
   AUTH_SECRET=至少 32 字节的随机值
   # 可选：WEB_PUSH_PUBLIC_KEY=... / WEB_PUSH_PRIVATE_KEY=...
   EOF
   ```
4. **签 HTTPS 证书**（等 DNS 生效后）
   ```bash
   sudo certbot --nginx -d chenju.work -d www.chenju.work
   ```
5. **启用 Nginx 站点**
   ```bash
   scp deploy/nginx-chenju.work.conf <用户名>@<服务器IP>:/tmp/
   # 服务器上：
   sudo cp /tmp/nginx-chenju.work.conf /etc/nginx/sites-enabled/chenju.work
   sudo nginx -t && sudo nginx -s reload
   ```
   > certbot 若已自动改写配置并生效，这一步可以跳过。
6. **首次启动**：服务器上执行 `bash /opt/chengju/deploy/cicd-deploy.sh`
7. **配 CI 密钥**：GitHub 仓库 → Settings → Secrets and variables → Actions，新增两个 secret
   - `CHENGJU_HOST` = 服务器公网 IP
   - `CHENGJU_SSH_KEY` = 部署用私钥全文（本地生成一对，公钥写进服务器的 `~/.ssh/authorized_keys`）

### 四个必须知道的坑

**🔴 禁止边构建边服务。** `npm run build` 会覆盖 `.next` 目录，如果 PM2 进程还在跑，它会读到写了一半的构建产物，直接 500。`cicd-deploy.sh` 已固定为「先 `pm2 stop` → 构建 → `pm2 start`」，手动操作时也必须照这个顺序。

**🔴 Nginx 超时必须大于模型超时。** `lib/deepseek.ts` 里 `TIMEOUT_MS = 240s`，而 Nginx 的 `proxy_read_timeout` 默认只有 60s。不改的表现是：本地怎么跑都正常，一上线第三步生成分集就 504。长集数会分多批（最多 600s），`deploy/nginx-chenju.work.conf` 里已给到 660s。

> 第三步改流式之后这条的压力小了很多：`proxy_read_timeout` 计的是「两次读操作之间的**间隔**」，流式持续吐字会不断把它重置回去，不再是从头到尾累积。保留 660s 是为了兜住「模型迟迟不吐第一个字」和多批之间的空档。

**🔴 流式响应必须关掉 nginx 缓冲。** 默认的 `proxy_buffering` 会把 SSE 攒够一批再下发，流式效果直接消失，退化成改之前「等十几秒然后全部出现」的样子。应用侧在响应头里带了 `X-Accel-Buffering: no`，nginx 认这个头，**所以 nginx 配置一个字都不用改**——这一点在生产环境实测确认过（`Server: nginx/1.24.0` + `Content-Encoding: none`，分集帧间距 600ms~1s）。

> 同理，`gzip_types` 里**不能**加 `text/event-stream`：压缩同样要攒够数据才能开始。`deploy/nginx-chenju.work.conf` 里的 `gzip_types` 只列了 `text/plain text/css application/javascript application/json application/xml image/svg+xml`，没有 `text/event-stream`，正好安全。

**端口是 3001。** 同一台服务器上还跑着另一个应用、占着 3000，两个不能混用；端口写在 `ecosystem.config.cjs` 的 `args` 里。

### 手动部署 / 排查

CI 是主路径。要手动触发就在 GitHub Actions 页面点 **Run workflow**；排查问题直接 ssh 上去跑 `bash /opt/chengju/deploy/cicd-deploy.sh`，或 `pm2 logs chengju` 看日志。

### 备选：Vercel

不想维护服务器的话 Vercel 也能跑：

1. [vercel.com/new](https://vercel.com/new) 导入仓库，项目名填 `chengju`（子域名会是 `chengju.vercel.app`）
2. Settings → Environment Variables 加 `DEEPSEEK_API_KEY`、`ALIYUN_DASHSCOPE_API_KEY`；需要登录和通知时再加 `AUTH_SECRET` 与 Web Push 配置
3. Deploy

> Vercel 的可用时长取决于当前套餐和运行时。短集数可以试跑；60 集分 6 批、整条流最长 600 秒，
> 更适合部署在支持长连接和后台任务的 Node 环境。`*.vercel.app` 在国内访问也经常被污染或很慢。

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t chengju .
docker run -p 3000:3000 -e DEEPSEEK_API_KEY=sk-xxx chengju
```

---

## 常见问题

**点生成没反应 / 报「未配置 API Key」**
确认根目录有 `.env.local` 且填了密钥，然后**重启** `npm run dev`（改环境变量必须重启）。

**报「API Key 无效」**
密钥复制错了，或者账户余额不足。去服务商控制台确认。

**报「AI 生成超时」**
第三步生成分集内容较大（60 集分 6 批，耗时更长）。重试一次通常即可；持续超时可以把 `lib/deepseek.ts` 的 `TIMEOUT_MS` 调大。

**想换模型 / 换成其他厂商**
改 `.env.local` 里的 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL` 即可（需兼容 OpenAI 的 `/chat/completions` 协议）。Prompt 在 `lib/prompts.ts`，可以自由调整。

**刷新页面后项目还在吗？**
项目内容会保存在当前浏览器的匿名会话与服务端 SQLite 快照中，刷新页面、切换项目都能恢复。
但服务端认的是这个浏览器的 Cookie：换浏览器或设备、清理站点数据后，就看不到原来的项目。
登录后项目会归属到手机号账号，可在 Web 与 App 间恢复；未登录时仍按当前浏览器匿名会话保存。图片仍只在你自己的本地图库，不随登录或匿名会话上传。

**分集或分镜生成到一半失败了怎么办？**
直接再次点生成即可。服务端会按输入签名找到对应 checkpoint，从下一批继续；人物、大纲或场次改过之后，旧 checkpoint 会自动失效，从头生成。

**关键帧图片存在哪里？**
用户主动点击生成后，通义万相返回的图片会存进当前服务器的 `CHENGJU_DATA_DIR/generated`，元数据写入 SQLite。历史版本可以回选，删除项目时文件会一起清理。本地参考图像素仍然不进入服务端。

**登录后本地参考图会跨设备同步吗？**
不会。账号同步的是项目文本、快照、任务和生成结果，本地图库里的原图和目录授权仍是设备级的。

**为什么生成任务会显示“上次生成等待已中断”？**
服务重启、浏览器刷新或请求异常后，任务可能停在 queued/running。读取任务列表时，超过安全时限的任务会恢复为 failed，并提示可以重试；通义侧的远端任务可能仍会完成，但不会写入当前项目。

**通知为什么没有弹出来？**
通知必须由用户点击“开启完成通知”后请求权限，并需要 HTTPS、浏览器支持和服务器 VAPID 配置。取消生成不会推送；失败推送也不会包含密钥、完整 Prompt 或服务器路径。
