<div align="center">

# 成剧

**短剧与漫剧的 AI 分镜台：一句想法，到大纲、分集与能直接出图的提示词**

独立短剧编剧的 AI 创作与资产工具。**打开网页就用，不装任何东西。**

[![线上体验](https://img.shields.io/badge/🌐_线上体验-chenju.work-2ea44f?style=for-the-badge)](https://chenju.work)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-165_passing-2ea44f?style=for-the-badge)](#测试)
[![图片不上传](https://img.shields.io/badge/图片-永不上传-important?style=for-the-badge)](#三条硬指标)
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
角色参考图始终存在你自己的硬盘上——**本工具不上传、不托管任何图片**。

## 三条硬指标

这个工具只有一个主张：**最轻**。以下三条不是卖点，是可以当场验证的约束。

| | 指标 | 具体到什么程度 | 怎么验 |
|---|---|---|---|
| 🚀 | **零部署** | 从打开 [chenju.work](https://chenju.work) 到拿到第 1 个镜头，**不需要安装任何东西**——不要 Docker、不要注册、不要本机跑服务 | 打开即用，全程只需一个浏览器 |
| 🔒 | **零上传** | 图片**从不经过服务端**。服务端只存 `vaultKey`（图在你硬盘上的路径）+ `fileHash`（校验指纹），不存像素 | `/api/refs` 收到带 `data`/`base64`/`file`/`image` 字段的请求会**直接 400 拒绝** |
| 📦 | **零锁定** | 全部资产可一键导出为自包含 zip（含离线分镜表），换工具不用重建 | 「打包带走」按钮，图片一并并入 zip |

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
- [测试](#测试)
- [稳健性设计](#稳健性设计)
- [AI 编程怎么参与开发](#ai-编程怎么参与开发)
- [路线图](#路线图)
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
| **不做图像 / 视频生成** | 一旦接生成，图就必须上云，「零上传」当场失效。我们只产出提示词，出图交给即梦/可灵 |
| **不做全自动成片** | 那是 [huobao-drama](https://github.com/chatfire-AI/huobao-drama) 的赛道。人在环里才有判断权 |
| **不做用户系统 / 协作** | 上来就要注册的东西，和「打开即用」冲突 |
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

- ❌ **不做视频生成**——一旦接生成，图就必须上云，零上传的承诺当场失效
- ❌ **不做大纲之外的创作辅助**（角色库、协作、用户系统）
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
npm test    # 165 条用例，零测试框架依赖
npm run build
```

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DEEPSEEK_API_KEY` | 是 | — | DeepSeek API Key，在 https://platform.deepseek.com/api_keys 申请 |
| `DEEPSEEK_BASE_URL` | | `https://api.deepseek.com/v1` | 兼容 OpenAI 协议的服务地址 |
| `DEEPSEEK_MODEL` | | `deepseek-chat` | 模型名 |

> `.env.local` 已在 `.gitignore` 中，不会被提交。密钥只在服务端使用，前端拿不到。

---

## 技术实现

| | 层 | 选型 | 说明 |
|---|---|---|---|
| ⚛️ | 前端 | Next.js 14 App Router + Tailwind CSS 3 | 纯手写样式，**没有引入任何 UI 组件库** |
| 🔌 | 后端 | Next.js API Routes | 全栈一体，不用单独起服务 |
| 🧠 | 模型 | DeepSeek（`deepseek-chat`） | OpenAI 兼容协议。人物/三幕/定妆/场次一次性返回；**分集与分镜走 SSE 流式**，边生成边渲染 |
| 🗄️ | 存储 | SQLite 单文件（`node:sqlite`） | 只存文本与引用：项目 / 快照 / 血缘 / 图台账。库文件放仓库外，避开构建覆盖。**不存任何图片** |
| 📦 | 依赖 | **0 个第三方运行时依赖** | ZIP 打包手写、测试用 `node:test`、本地库用 `node:sqlite` |

> 依赖只有 Next / React / Tailwind（都是框架本身）。功能层没有拉任何 npm 包——
> 这不是洁癖：每多一个依赖，用户自部署时踩坑的概率就多一分。

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

---

## 项目结构

```
chengju/
├── app/
│   ├── layout.tsx                  # 根布局 + 页面元信息
│   ├── globals.css                 # Tailwind 入口 + 全局底色
│   ├── page.tsx                    # 主页面：六步工作流的状态编排（状态槽按 StepKey 隔离）
│   └── api/
│       ├── characters/route.ts     # ① 生成人物（整组 / 单个两种模式）
│       ├── acts/route.ts           # ② 三幕大纲
│       ├── episodes/route.ts       # ③ 分集（10/30/60 可选，每 10 集一批，SSE 流式）
│       ├── visual/route.ts         # ④ 视觉定妆 + 定妆图提示词
│       ├── scenes/route.ts         # ⑤ 场次剧本
│       ├── shots/route.ts          # ⑥ 分镜（SSE 流式，一镜一镜出现）
│       ├── projects/route.ts       # 项目：创建 / 列表
│       ├── snapshots/route.ts      # 快照：按 kind 列出全部版本
│       ├── impact/route.ts         # 影响范围：改一处，反查受影响的下游
│       ├── refs/route.ts           # 图台账：只收引用与指纹，带二进制直接 400
│       └── export/route.ts         # 导出清单（文本类；图片由前端并入 zip）
├── components/
│   ├── IdeaPanel.tsx               # 工作面输入区（想法 + 示例 + 生成按钮）
│   ├── StepPills.tsx               # 顶部六步胶囊（等宽序号 + 当前步）
│   ├── StepSection.tsx             # 每个步骤的外壳（未开始/加载中/出错/有结果）
│   ├── VersionBar.tsx              # 版本与联动面板：过期提示 + 影响镜头数
│   ├── CharacterList.tsx           # 人物卡片列表（可编辑/删除/换一个）
│   ├── ActList.tsx                 # 三幕大纲列表
│   ├── EpisodeList.tsx             # 分集列表
│   ├── SceneList.tsx               # 场次列表
│   ├── ShotList.tsx                # 镜头列表
│   ├── ShotCard.tsx                # 镜头卡：主工作面（含「缺参考图」跳转、执行单复制）
│   ├── VisualAnchorPanel.tsx       # 定妆表 + 批量出图工具箱（母版 + 变量值）
│   ├── RefImagePicker.tsx          # 带缩略图的九宫格选图器
│   ├── VaultPanel.tsx              # 本地图库面板（显示当前模式与文件数）
│   ├── CopyButton.tsx              # 复制按钮
│   ├── AutoTextarea.tsx            # 高度自适应的输入框
│   └── Skeleton.tsx                # 加载骨架屏
├── lib/
│   ├── types.ts                    # 创作层共享类型 + 六步元信息（STEPS）
│   ├── deepseek.ts                 # 模型调用封装（一次性 + 流式 / 超时 / 重试 / JSON 解析）
│   ├── partial-json.ts             # 从没接收完的 JSON 里抠出已闭合的元素，供流式渲染
│   ├── prompts.ts                  # 创作层三个 Prompt 模板
│   ├── normalize.ts                # 创作产物整形、兜底
│   ├── validate.ts                 # 请求入参校验与截断
│   ├── api.ts                      # 统一响应信封 + 前端请求封装（含 SSE）
│   ├── export.ts                   # Markdown 拼装 / 复制 / 下载
│   └── assets/                     # ── 资产链（与创作层刻意分开）──
│       ├── types.ts                # VisualCharacter / Shot / Scene / RefImageMeta
│       ├── db.ts                   # SQLite 单文件：projects / snapshots / lineage / ref_images
│       ├── repo.ts                 # 项目 / 快照 / 血缘的读写
│       ├── store.ts                # 数据库单例（dev 热重载不堆句柄）
│       ├── anchors.ts              # 锚点编译器 ← 跨镜头一致性的技术核心
│       ├── graph.ts                # isStale / findImpact ← 「改一处算得出影响了谁」
│       ├── normalize.ts            # 镜头整形 + ★锚点强制注入 + 参考图标注
│       ├── prompts.ts              # 资产层三个 Prompt（定妆 / 场次 / 分镜）
│       ├── refs.ts                 # 图台账读取 → 角色名到参考图的映射
│       ├── persist.ts              # 快照落库共用逻辑（失败不阻断生成）
│       ├── vault.ts                # 本地图库（目录直连 / IndexedDB 双路径）
│       └── export.ts               # 打包带走：执行单 / 首尾帧衔接清单 / CSV / 离线 HTML / 手写 ZIP
├── tests/                          # 18 个用例文件，165 条用例（node:test，零框架依赖）
├── deploy/
│   ├── nginx-chenju.work.conf      # Nginx 站点配置（香港服务器，反代 3001）
│   └── cicd-deploy.sh              # 服务器端部署脚本：停服 → 构建 → 启动
├── .github/workflows/deploy.yml    # push main 自动部署
├── ecosystem.config.cjs            # PM2 进程配置（应用跑在 3001）
└── .env.example                    # 环境变量模板
```

---

## 接口与数据结构

三个接口都返回统一的信封格式：

```jsonc
// 成功
{ "success": true, "data": { ... }, "error": null }
// 失败
{ "success": false, "data": null, "error": "给用户看的中文提示" }
```

| 方法 | 路径 | 请求体 | 返回 |
|------|------|--------|------|
| POST | `/api/characters` | `{ idea, mode?, existing? }` | `{ characters: Character[] }` |
| POST | `/api/acts` | `{ idea, characters }` | `{ acts: Act[] }` |
| POST | `/api/episodes` | `{ idea, characters, acts }` | **SSE 事件流**（见下） |
| POST | `/api/visual` | `{ projectId?, idea, characters }` | `{ visualCharacters, imagePrompts }` |
| POST | `/api/scenes` | `{ projectId?, idea, characters, episodes }` | `{ scenes: Scene[] }` |
| POST | `/api/shots` | `{ projectId?, idea, characters, acts, scenes, visualCharacters }` | **SSE 事件流**（同 episodes 形状） |
| POST | `/api/projects` | `{ title }` | `{ project }` |
| GET | `/api/projects` | — | `{ projects: Project[] }` |
| GET | `/api/snapshots` | `?projectId=&kind=` | `{ snapshots: Snapshot[] }`（version 倒序） |
| GET | `/api/impact` | `?snapshotId=` | `{ affected: Snapshot[] }`（含多层下游） |
| GET | `/api/refs` | `?projectId=` | `{ refs: RefImageMeta[] }` |
| POST | `/api/refs` | `{ projectId, refs: [{ vaultKey, fileHash, ownerType, ownerId, ... }] }` | `{ refs, saved }`；**带二进制字段直接 400** |
| GET | `/api/export` | `?projectId=` | `{ manifest: { project, latest, refs, exportedAt } }` |

`mode` 为 `'single'` 时只生成 1 个角色（用于「换一个」和「添加角色」），此时需要传 `existing` 作为已有阵容，让模型避开功能重复。

### `/api/episodes` 是唯一走 SSE 的接口

前两个接口返回上面那个 JSON 信封；分集返回 `text/event-stream`，三种事件：

| 事件 | 载荷 | 说明 |
|------|------|------|
| `episodes` | `{ episodes: Episode[] }` | 已生成的部分结果，每次都是**全量**，不是增量 |
| `done` | `{ episodes: Episode[] }` | 最终结果，以这一份为准 |
| `error` | `{ error: string }` | 生成中途失败，按普通错误提示处理 |

**为什么每次都推全量**，而不是只推新增的那几集：`normalizeEpisodes` 按数组下标定集数，只喂新增部分的话每批都会从第 1 集重新编号。

**错误分两段**：入参校验失败时流还没建立，返回的仍是普通 JSON 信封（HTTP 4xx）；流已经开始之后才失败，才走 `error` 事件。`lib/api.ts` 的 `postSse` 把这两种情况都归一成抛异常，调用方的 catch 写法和 `postJson` 一致。

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

## 测试

```bash
npm test        # 165 条用例，全部通过
```

**零测试框架依赖**——用的是 Node 内置的 `node:test`。测试进程里有一个解析钩子
（`tests/loader.mjs`）补上 Next 的裸模块说明符与 `@/` 路径别名，所以能直接测路由的导出函数，
不必为了可测性去改业务代码。

| 用例文件 | 覆盖什么 |
|---|---|
| `anchors.test.ts` | 锚点编译的幂等性与字段顺序（一致性成立的前提） |
| `graph.test.ts` | 过期判定与影响范围（含环形依赖不死循环） |
| `assets.test.ts` | 血缘建立、版本递增、旧版可回溯 |
| `shots.test.ts` | 镜头整形、锚点强制注入、运镜兜底 |
| `vault.test.ts` | 图库取图、读不到时不挂死 |
| `auto-attach.test.ts` | 按目录名自动挂图（只补空缺，不覆盖手动挂的） |
| `workorder.test.ts` | 执行单含四要素、缺图必须显式标出 |
| `step-isolation.test.ts` | 六步状态槽不串台（修过的 bug 不回归） |
| `refs-export.test.ts` | 打包清单含离线可看的分镜表 |

---

## 稳健性设计

大模型的输出天然不稳定，这几处做了兜底：

1. **JSON 解析兜底**（`lib/deepseek.ts`）：模型偶尔会给 JSON 套上围栏或加一段解释文字，解析时会依次尝试直接解析 → 去代码围栏 → 截取最外层对象/数组
2. **解析失败自动重试**：整个请求重试一次（模型重新生成通常就正常了）；密钥错误、超时这类重试没意义的问题直接抛出
3. **字段整形**（`lib/normalize.ts`）：模型漏字段、写错键名、把数组包在多余对象里，都在这里补齐兜底，保证界面拿到的一定是完整结构
4. **集数以数组下标为准**：不信任模型写的集数，避免界面乱序
5. **清晰的错误文案**：401 / 429 / 超时 / 网络异常分别翻译成用户看得懂的中文，技术细节只进服务端日志
6. **上游改动提示**：改了人物之后再重新生成三幕，会提示「当前大纲基于旧人物生成」，而不是默默清空你已经改好的内容。这份「是否过期」由生成时记录的输入指纹推导，因此中途编辑不会被生成回写覆盖
7. **入参硬上限**（`lib/validate.ts`）：想法 ≤ 500 字，人物 ≤ 5 个、三幕 ≤ 3 幕、每幕 ≤ 8 个情节点、单个字段 ≤ 400 字，超出直接截断。三个接口都是公开且要花钱的，不设上限等于把自己的额度交出去
8. **请求纪元**（`app/page.tsx`）：生成过程中点「清空重来」，返回的结果会被丢弃，而不是把已清空的页面重新填满
9. **只渲染「已经写完」的分集**（`lib/partial-json.ts`）：分集是边生成边渲染的，但缓冲区里随时可能是一个只写了一半的 JSON 对象。这里按括号配平扫描，只有已经闭合、且能通过 `JSON.parse` 的元素才交给界面，半截的一律等下一块数据补齐。流结束后还会用完整缓冲区整体解析一次兜底，保证最终结果和一次性调用时完全一致

---

## AI 编程怎么参与开发

这个项目的代码**主要由 Claude Code 完成**，我的工作是定方案、写 Prompt、验收纠偏。

**我定的部分：**

- **产品方案**：为什么拆成两层六步、每步之间靠什么传递上下文、哪些地方必须留人工判断
- **Prompt 设计**：每一步给模型什么角色、什么约束、什么输出格式，全部集中在 `lib/prompts.ts`
- **交互取舍**：上游改了只提示过期、不自动清空下游；生成中允许「清空重来」，用请求纪元把过期响应丢掉

**实现交给 AI，我负责验收。** 需求描述清楚之后，项目搭建、界面、接口调用、状态管理由 Claude Code 一次写出，我在跑通和审查的过程中发现问题再让它改。

**验收中发现并修掉的问题：**

- **Prompt 太泛，人物立不住**：第一版角色动机写出来是「想要成功」这种正确的废话。改法是要求动机必须说明「最想要什么、为什么」，性格必须写成能指导表演的**行为倾向**（「遇事先算成本，被逼到绝路才肯拼命」），而不是形容词
- **模型会用描述性的话糊弄钩子**：分集 Prompt 加了一条硬约束——钩子要写清最后一秒发生了什么，**不许写「留下悬念」「引发观众好奇」这种描述钩子的话**。不写死这条，模型会用一句套话把任务标记成完成
- **上线才暴露的问题**：Nginx 的 `proxy_read_timeout` 默认 60s，小于应用里 120s 的模型超时，本地怎么跑都正常、一上线第三步必 504；`git reset --hard` 会覆盖正在执行的部署脚本，所以脚本先把自己复制到 `/tmp` 再 `exec`。这两条都记在下面的「四个必须知道的坑」里

**我的判断**：AI 把「写代码」这一步压缩到几乎不花时间，但**需求描述不清、验收不严，出来的就是能跑但不能用的东西**。上面这些问题没有一个是写完就对的——都是我实际跑起来、看到输出不对才回头改的。

---

## 路线图

「已完成」这一栏会越积越长，所以这里只留**还没做**的，以及明确不做的。

| 方向 | 状态 | 说明 |
|---|---|---|
| 本地图库真机回归 | 🔬 验证中 | `fs-access` 目录直连需要真实 Chrome/Edge 授权目录后走一遍，确认缩略图与自动挂图 |
| 可灵首尾帧衔接清单 | 📋 计划中 | **通用版已上线**（导出包的 `chaining.txt` + 「复制衔接清单」按钮，即梦/可灵都适用）；可灵界面特有的字段还没摸清，不凭猜测做 |
| 导出包 schema 版本化 | 📋 计划中 | `project.json` 要带 schema 版本，否则字段一改旧包就打不开 |
| 多项目切换界面 | 📋 计划中 | 接口已就绪（`/api/projects`），界面目前同时只能开一个 |
| 导出 PDF | 📋 待定 | 目前是 Markdown + 离线 HTML + CSV，PDF 要不要做还没定 |
| LangGraph 重写执行层 | ❌ 不做 | 六步已是可独立重跑的调用，改成图收益不抵复杂度 |
| 服务端图片存储 | ❌ **永不做** | 违反零上传 |

> 「不做」和「永不做」是认真的。这个项目的生存空间在于**窄**，
> 每加一块都是拿「轻」去换「全」，而「全」已经有人做得更好了（见[竞争格局](#竞争格局为什么这件事还值得做)）。

---

## 许可证与自建

### 为什么是 AGPL-3.0

不是随手挑的，和两条硬指标直接相关：

**「图片不上传」这个承诺，只有代码可审计才有意义。** 服务端不碰像素这件事，
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
| `CHENGJU_DATA_DIR` | | `./data` | SQLite 库所在目录（建议放仓库外） |
| `CHENGJU_DAILY_UNITS` | | `65` | 单个身份每天的额度（1 个完整项目 = 13，默认够跑 5 个项目） |
| `CHENGJU_DAILY_UNITS_GLOBAL` | | `3900` | 全站每天熔断阈值（约 300 个项目/天） |
| `CHENGJU_TZ` | | `Asia/Shanghai` | 额度按哪个时区切日（服务器在 UTC 时尤其要留意） |

> 最后两项只对**托管版**有意义——自建时是你自己的 key，额度限制形同虚设，
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
   printf 'DEEPSEEK_API_KEY=%s\n' 'sk-你的密钥' > .env
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
2. Settings → Environment Variables 加 `DEEPSEEK_API_KEY`
3. Deploy

> Vercel 现在函数超时默认已提升到 300 秒，三个接口声明的 `maxDuration`（120-180 秒）都在范围内。
> 但 `*.vercel.app` 在国内访问经常被污染或很慢，要给国内的人看还是用香港服务器。

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

**刷新页面数据没了**
设计如此——纯前端状态，没有数据库。需要持久化的话可以接 localStorage 或数据库。
