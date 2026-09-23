# 成剧

> 一句话成剧。

给独立短剧编剧的 AI 大纲生成工具——输入一句话故事想法，分三步生成完整短剧大纲：**核心人物 → 三幕结构 → 分集剧情**。

**名字的来历**：「成剧」既读作「一句话成为一部剧」，也谐音「成句」——产品的输入恰好就是一句话。短剧这行靠钩子活着，但钩子只有放进完整结构里才成立，所以名字落在「剧」上，不落在「钩」上。

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
| 模型 | DeepSeek（`deepseek-chat`） | OpenAI 兼容接口，一次性返回，不做流式 |
| 数据库 | 无 | MVP 阶段生成完就用了，不需要持久化 |

**关于模型**：调用走的是 OpenAI 兼容协议，所以换供应商只是改两个环境变量的事，代码一行不用动。

```bash
# 例如换成火山方舟的豆包，改 .env.local 这两项即可
# 具体服务地址与模型名以火山方舟控制台为准
DEEPSEEK_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
DEEPSEEK_MODEL="<你的推理接入点 ID>"
```

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
│   ├── deepseek.ts                 # 模型调用封装（超时 / 重试 / JSON 解析）
│   ├── prompts.ts                  # 三个步骤的 Prompt 模板
│   ├── normalize.ts                # 把模型返回的数据整形、兜底
│   ├── validate.ts                 # 请求入参校验与截断
│   ├── api.ts                      # 统一响应信封 + 前端请求封装
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
| POST | `/api/episodes` | `{ idea, characters, acts }` | `{ episodes: Episode[] }` |

`mode` 为 `'single'` 时只生成 1 个角色（用于「换一个」和「添加角色」），此时需要传 `existing` 作为已有阵容，让模型避开功能重复。

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

---

## AI 编程怎么参与开发

- 大部分代码由 Claude Code 完成：项目搭建、界面、接口调用、状态管理
- 我自己负责的是 **Prompt 设计和产品流程**——三步怎么切、每步给模型什么上下文、「换一个」和过期提示这些交互
- AI 输出的问题：**Prompt 写得太泛，生成的人物不够具体**。比如第一版角色动机写出来是「想要成功」这种正确的废话。我改了 Prompt，要求动机必须说明「最想要什么、为什么」，性格必须写成能指导表演的行为倾向（「遇事先算成本，被逼到绝路才肯拼命」），而不是形容词。分集 Prompt 也加了一条：钩子要写清最后一秒发生了什么，**不许写「留下悬念」「引发观众好奇」这种描述钩子的话**

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

生产环境与 AI面师同机：**腾讯云香港轻量服务器**（`43.129.23.197`），免备案，PM2 常驻，Nginx 反代。

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

1. **DNS**：在阿里云控制台给 `chenju.work` 和 `www.chenju.work` 各加一条 A 记录，指向 `43.129.23.197`
2. **建目录并拉代码**（服务器上执行）
   ```bash
   sudo mkdir -p /opt/chengju && sudo chown ubuntu:ubuntu /opt/chengju
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
   scp deploy/nginx-chenju.work.conf ubuntu@43.129.23.197:/tmp/
   # 服务器上：
   sudo cp /tmp/nginx-chenju.work.conf /etc/nginx/sites-enabled/chenju.work
   sudo nginx -t && sudo nginx -s reload
   ```
   > certbot 若已自动改写配置并生效，这一步可以跳过。
6. **首次启动**：服务器上执行 `bash /opt/chengju/deploy/cicd-deploy.sh`
7. **配 CI 密钥**：GitHub 仓库 → Settings → Secrets and variables → Actions，新增两个 secret
   - `CHENGJU_HOST` = `43.129.23.197`
   - `CHENGJU_SSH_KEY` = 本地 `~/.ssh/deploy_key` 的私钥全文（与 AI面师共用同一把）

### 三个必须知道的坑

**🔴 禁止边构建边服务。** `npm run build` 会覆盖 `.next` 目录，如果 PM2 进程还在跑，它会读到写了一半的构建产物，直接 500。`cicd-deploy.sh` 已固定为「先 `pm2 stop` → 构建 → `pm2 start`」，手动操作时也必须照这个顺序。

**🔴 Nginx 超时必须大于模型超时。** `lib/deepseek.ts` 里 `TIMEOUT_MS = 120s`，而 Nginx 的 `proxy_read_timeout` 默认只有 60s。不改的表现是：本地怎么跑都正常，一上线第三步生成 10 集就 504。`deploy/nginx-chenju.work.conf` 里已给到 300s。

**端口是 3001。** 同机的 AI面师占着 3000，两个应用不能混用。

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
