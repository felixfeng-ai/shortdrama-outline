# 成剧

> 一句话成剧。

**🔗 线上体验：https://chenju.work**

给独立短剧编剧的 AI 大纲生成工具——输入一句话故事想法，分三步生成完整短剧大纲：**核心人物 → 三幕结构 → 分集剧情**。

**名字的来历**：「成剧」既读作「一句话成为一部剧」，也谐音「成句」——产品的输入恰好就是一句话。短剧这行靠钩子活着，但钩子只有放进完整结构里才成立，所以名字落在「剧」上，不落在「钩」上。

> 线上域名是 `chenju.work`，比品牌拼音少一个 g——`chengju.work` 已被他人注册，退而取了去掉 g 的拼写，读音不变。

```
一句话想法  →  ① 核心人物  →  ② 三幕大纲  →  ③ 10 集分集剧情  →  复制 / 导出
```

每一步的结果都能直接编辑，改完再进入下一步。

---

## 目录

- [我解决的问题](#我解决的问题)
- [为什么选这个方向](#为什么选这个方向)
- [产品设计：为什么分三步](#产品设计为什么分三步)
- [快速开始](#快速开始)
- [技术实现](#技术实现)
- [项目结构](#项目结构)
- [接口与数据结构](#接口与数据结构)
- [稳健性设计](#稳健性设计)
- [AI 编程怎么参与开发](#ai-编程怎么参与开发)
- [二期计划](#二期计划)
- [部署](#部署)
- [常见问题](#常见问题)

---

## 我解决的问题

独立短剧编剧（1-3 人小团队）最痛的三个问题：

### 一、有灵感但写不出结构

脑子里有个好点子，但不知道怎么拆成 10 集。一个想法到一份能开拍的大纲之间，隔着人物、结构、节奏三道坎，很多人卡在第一道就放弃了。

### 二、人物立不住

写着写着人物就崩了，前后矛盾。第 3 集还是精于算计的人，第 7 集突然变成恋爱脑——因为没有一份写死的「动机 + 弧光」在约束后面的剧情。

### 三、每集没钩子

不知道每集结尾怎么留悬念让人想看下一集。短剧是 1-3 分钟一集、靠完播率和追更活着的品类，**没有钩子就没有下一集**。

**现在的 AI 写作工具都是一次性生成一大段，用户不知道怎么改。** 我这个产品把创作拆成三步工作流，每步都可以单独编辑、单独重新生成，人始终保留判断权。

---

## 为什么选这个方向

- **短剧是现在 AI 内容创作最成熟的赛道，验证最快**——需求明确、节奏标准、好坏有客观标准（完播率）
- **大纲是创作第一步，也是 AI 最能帮上忙的环节**——大纲对了，后面写正文才不会跑偏；大纲错了，后面写得再顺也是白写
- **不贪多，先把「灵感 → 结构化大纲」这一步做透**

---

## 产品设计：为什么分三步

### 一键生成的大纲，用户不知道从哪改起

让 AI 一口气吐 5000 字大纲，结果是一坨无法下手的文本。用户只有两个选择：全盘接受，或者全部重来。

### 分三步，每步都可以单独编辑、单独重新生成

```
输入一句话想法
   ↓
① 生成核心人物    3-5 个角色：姓名 / 身份 / 性格 / 动机 / 弧光
   ↓  ← 可以改字段、删角色、「换一个」单独重生成
② 生成三幕大纲    铺垫 / 冲突 / 结局，每幕带关键情节点
   ↓  ← 可以改梗概、增删情节点
③ 生成 10 集分集   每集：标题 / 剧情梗概 / 结尾钩子
   ↓  ← 可以改任意一集
复制全部大纲 / 导出 .md
```

**这就是创作工具和「聊天机器人」的区别——人始终保留判断权。** 每一小步的结果都摆在台面上，用户改哪一步、重生成哪一步，自己说了算。

产品里有两个细节是围绕这一点做的：

- **「换一个」**：对某个角色不满意，只换他一个，其余阵容不动（新角色会被要求与现有角色形成新的冲突关系，避免功能重复）
- **过期提示**：改了人物之后，三幕大纲区域会提示「当前大纲基于旧人物生成，建议重新生成」，但**不会偷偷清空你已经改好的内容**

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置密钥
cp .env.example .env.local
# 编辑 .env.local，填入你的 API Key

# 3. 启动
npm run dev
```

打开 http://localhost:3000

### 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DEEPSEEK_API_KEY` | 是 | — | DeepSeek API Key，在 https://platform.deepseek.com/api_keys 申请 |
| `DEEPSEEK_BASE_URL` | | `https://api.deepseek.com/v1` | 兼容 OpenAI 协议的服务地址 |
| `DEEPSEEK_MODEL` | | `deepseek-chat` | 模型名 |

> `.env.local` 已在 `.gitignore` 中，不会被提交。密钥只在服务端使用，前端拿不到。

---

## 技术实现

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 | Next.js 14 App Router + Tailwind CSS 3 | 纯手写样式，没有引入任何 UI 组件库 |
| 后端 | Next.js API Routes | 全栈一体，不用单独起服务 |
| 模型 | DeepSeek（`deepseek-chat`） | OpenAI 兼容接口。人物和三幕一次性返回；分集走流式，边生成边渲染 |
| 数据库 | 无 | MVP 阶段生成完就用了，不需要持久化 |

**为什么是 DeepSeek**，只看两条：

- **上下文**。第三步的输入是「一句话想法 + 全部角色（每人 6 个字段）+ 三幕大纲（含情节点）」，
  输出是 10 集、每集三个字段。这里要防的不是「上下文塞不下」，而是**输出被 `max_tokens`
  截断、JSON 只写了一半**——所以第三步的 `max_tokens` 单独给到 8000（前两步 4000），
  `lib/deepseek.ts` 的 `TIMEOUT_MS` 也给到 120s。
- **成本**。一次完整生成（三步全走）在万级 token，按官网单价折下来是分币级别。
  单价低是「入参硬上限」这条敢成立的前提（见「稳健性设计」第 7 条）：
  单次成本压得住，才敢不做限流、只卡单次入参规模。

**没做的事**：没做多模型路由，没给每一步挑不同的模型，没做 RAG。
这个阶段要验证的是「三步工作流」这个产品假设，不是模型能力上限；
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

### 三个 Prompt

分别对应三步生成，全部集中在 `lib/prompts.ts`，改提示词不用碰路由和界面代码：

| Prompt | 设计要点 |
|---|---|
| **人物生成** | 要求角色之间有**天然的对立关系**（利益/立场/情感冲突），动机必须能被剧情推动，性格用**行为倾向**描述而不是「善良」「勇敢」这类空词 |
| **三幕大纲** | 按标准三幕结构给每一幕定死功能：第一幕结尾把主角推进无法回头的境地，第二幕中点必须有反转、结尾是最大低谷，第三幕用成长后的方式解决核心矛盾 |
| **分集剧情** | 强调短剧节奏：每集必须有冲突推进、**钩子必须是「未解决的问题」**（新危机爆发/秘密揭开/决定被打断），10 集冲突强度递进，第 8-10 集连续高潮 |

还有一个变体 Prompt 用于「换一个」和「+ 添加角色」——只生成一个角色，并把现有阵容传给模型要求它互补。

---

## 项目结构

```
chengju/
├── app/
│   ├── layout.tsx                  # 根布局 + 页面元信息
│   ├── globals.css                 # Tailwind 入口 + 全局底色
│   ├── page.tsx                    # 主页面：三步工作流的状态编排
│   └── api/
│       ├── characters/route.ts     # 第一步：生成人物（支持整组 / 单个两种模式）
│       ├── acts/route.ts           # 第二步：生成三幕大纲
│       └── episodes/route.ts       # 第三步：生成 10 集分集
├── components/
│   ├── IdeaPanel.tsx               # 左侧输入区（想法 + 示例 + 生成按钮）
│   ├── StepIndicator.tsx           # 顶部步骤条
│   ├── StepSection.tsx             # 每个步骤的外壳（未开始/加载中/出错/有结果）
│   ├── Skeleton.tsx                # 加载骨架屏
│   ├── CharacterList.tsx           # 人物卡片列表（可编辑/删除/重生成）
│   ├── ActList.tsx                 # 三幕大纲列表
│   ├── EpisodeList.tsx             # 分集列表
│   └── AutoTextarea.tsx            # 高度自适应的输入框
├── lib/
│   ├── types.ts                    # 全站共享的数据结构
│   ├── deepseek.ts                 # 模型调用封装（一次性 + 流式 / 超时 / 重试 / JSON 解析）
│   ├── partial-json.ts             # 从没接收完的 JSON 里抠出已闭合的元素，供流式渲染
│   ├── prompts.ts                  # 三个步骤的 Prompt 模板
│   ├── normalize.ts                # 把模型返回的数据整形、兜底
│   ├── validate.ts                 # 请求入参校验与截断
│   ├── api.ts                      # 统一响应信封 + 前端请求封装（含 SSE）
│   └── export.ts                   # Markdown 拼装 / 复制 / 下载
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

- **产品方案**：为什么拆成三步、每步之间靠什么传递上下文、哪些地方必须留人工判断
- **Prompt 设计**：每一步给模型什么角色、什么约束、什么输出格式，全部集中在 `lib/prompts.ts`
- **交互取舍**：上游改了只提示过期、不自动清空下游；生成中允许「清空重来」，用请求纪元把过期响应丢掉

**实现交给 AI，我负责验收。** 需求描述清楚之后，项目搭建、界面、接口调用、状态管理由 Claude Code 一次写出，我在跑通和审查的过程中发现问题再让它改。

**验收中发现并修掉的问题：**

- **Prompt 太泛，人物立不住**：第一版角色动机写出来是「想要成功」这种正确的废话。改法是要求动机必须说明「最想要什么、为什么」，性格必须写成能指导表演的**行为倾向**（「遇事先算成本，被逼到绝路才肯拼命」），而不是形容词
- **模型会用描述性的话糊弄钩子**：分集 Prompt 加了一条硬约束——钩子要写清最后一秒发生了什么，**不许写「留下悬念」「引发观众好奇」这种描述钩子的话**。不写死这条，模型会用一句套话把任务标记成完成
- **上线才暴露的问题**：Nginx 的 `proxy_read_timeout` 默认 60s，小于应用里 120s 的模型超时，本地怎么跑都正常、一上线第三步必 504；`git reset --hard` 会覆盖正在执行的部署脚本，所以脚本先把自己复制到 `/tmp` 再 `exec`。这两条都记在下面的「四个必须知道的坑」里

**我的判断**：AI 把「写代码」这一步压缩到几乎不花时间，但**需求描述不清、验收不严，出来的就是能跑但不能用的东西**。上面这些问题没有一个是写完就对的——都是我实际跑起来、看到输出不对才回头改的。

---

## 二期计划

| 方向 | 状态 | 说明 |
|---|---|---|
| **角色一致性管理** | 已完成 | 生成人物后，后续所有生成都基于这份人物设定。三幕和分集 Prompt 都会带上完整的角色动机与弧光 |
| **导出 Markdown** | 已完成 | 「复制全部大纲」和「导出 .md」 |
| **用 LangGraph 重写执行层** | 待做 | 每个步骤定义为一个 Graph Node，状态用 LangGraph 的 State 管理，支持条件边和中断恢复。现在三步是页面里的三段异步调用，改成图之后可以支持「只重跑第三步」「回滚到第二步」这类操作 |
| **版本记录** | 待做 | 每一步生成的结果都可以回溯，方便对比「换一个」前后的差异 |
| **导出 PDF** | 待做 | 目前只有 Markdown |

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

**🔴 Nginx 超时必须大于模型超时。** `lib/deepseek.ts` 里 `TIMEOUT_MS = 120s`，而 Nginx 的 `proxy_read_timeout` 默认只有 60s。不改的表现是：本地怎么跑都正常，一上线第三步生成 10 集就 504。`deploy/nginx-chenju.work.conf` 里已给到 300s。

> 第三步改流式之后这条的压力小了很多：`proxy_read_timeout` 计的是「两次读操作之间的**间隔**」，流式持续吐字会不断把它重置回 60s，不再是从头到尾累积。保留 300s 是为了兜住「模型迟迟不吐第一个字」的情况，留着零成本。

**🔴 流式响应必须关掉 nginx 缓冲。** 默认的 `proxy_buffering` 会把 SSE 攒够一批再下发，流式效果直接消失，退化成改之前「等十几秒然后全部出现」的样子。应用侧在响应头里带了 `X-Accel-Buffering: no`，nginx 认这个头，**所以 nginx 配置一个字都不用改**——这一点在生产环境实测确认过（`Server: nginx/1.24.0` + `Content-Encoding: none`，10 集帧间距 600ms~1s）。

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
第三步生成 10 集内容较大。重试一次通常即可；持续超时可以把 `lib/deepseek.ts` 的 `TIMEOUT_MS` 调大。

**想换模型 / 换成其他厂商**
改 `.env.local` 里的 `DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL` 即可（需兼容 OpenAI 的 `/chat/completions` 协议）。Prompt 在 `lib/prompts.ts`，可以自由调整。

**刷新页面数据没了**
设计如此——纯前端状态，没有数据库。需要持久化的话可以接 localStorage 或数据库。
