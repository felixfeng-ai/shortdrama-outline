# 首页性能与运营后台方案

> 调研日期：2026-11-17  
> 范围：Web 首页性能、运营后台、用户/额度管理、产品分析、Core Web Vitals  
> 状态：Phase 1 与运营后台 MVP 已落地（2026-11-18）

## 1. 线上性能证据

使用真实 Chrome、生产站点 `https://veyatv.com/`，390×844 与 1440×900 各跑两次：

| 视口 | FCP | LCP | TTFB | Load | JS 传输 |
|---|---:|---:|---:|---:|---:|
| Mobile #1 | 9.20s | 10.87s | 6.66s | 13.39s | 488 KB |
| Mobile #2 | 8.18s | 13.66s | 5.17s | 18.40s | 488 KB |
| Desktop #1 | 9.26s | 12.38s | 6.84s | 17.15s | 488 KB |
| Desktop #2 | 9.94s | 17.76s | 6.48s | 30.08s | 488 KB |

首屏总传输约 1.15 MB；最大两个 JS chunk 压缩后分别约 162 KB、163 KB。

本地同版本生产构建：

| 视口 | FCP | LCP | TTFB | Load |
|---|---:|---:|---:|---:|
| Mobile | 1.02s | 1.27s | 0.25s | 0.64s |
| Desktop | 0.51s | 0.71s | 0.01s | 0.36s |

结论：

1. **首要瓶颈是网络与源站入口，而不是页面计算。**
   - `veyatv.com` 的 A 记录直接指向香港源站。
   - 当前 Nginx 没有 CDN/边缘缓存；HTML 响应为 `no-store`。
   - TLS/TTFB 波动大，静态 JS 单文件实测总耗时可达 6.5–18.8 秒。
2. **首页代码过重会放大慢网问题。**
   - `app/page.tsx` 约 246 KB，整页为客户端组件。
   - 首屏一次引入 Agent、画布、生成、视频、小说、技能、时间线等所有模块。
3. **当前没有真实用户 Web Vitals 采集，因此线上问题只能人工复现。**

## 2. 可复用方案对比

VeyaShip 没有检索到可核验的公开产品资料，因此只按本次需求中的能力清单比较同类方案。

| 方案 | 开源/许可 | 可复用部分 | 不适合直接接入的原因 |
|---|---|---|---|
| [Refine](https://github.com/refinedev/refine) | MIT，约 36k stars | Admin 路由、CRUD、数据 Provider 模式 | 为完整后台应用设计，接入现有 SQLite/品牌仍需大量胶水，首屏依赖也更重 |
| [Tremor](https://github.com/tremorlabs/tremor) | Apache-2.0，约 3.7k stars | 指标卡、图表和密度模式 | 只是 UI 组件，不解决用户、额度、权限和数据层 |
| [PostHog](https://github.com/PostHog/posthog) | Source-available，约 40k stars | 事件、漏斗、用户画像、错误和 Web Vitals 产品模型 | 独立大型平台，部署与维护成本远高于当前内测体量 |
| [OpenPanel](https://github.com/Openpanel-dev/openpanel) | AGPL-3.0，约 7.3k stars | Web + Product Analytics、用户与会话视图 | 需要独立分析基础设施；AGPL 与现有服务端商业边界需额外评估 |
| [Betterlytics](https://github.com/betterlytics/betterlytics) | AGPL-3.0，约 195 stars | Web Vitals、错误、回放、实时 RUM | 更适合作为分析产品独立部署，不适合直接嵌进本项目管理后台 |
| [next-cwv-monitor](https://github.com/Blazity/next-cwv-monitor) | MIT，约 76 stars | Next.js Web Vitals 上报和趋势页模式 | 只解决性能观测，不解决用户、额度和业务统计 |
| [LiteSaaS Admin](https://github.com/litestartup-com/litesaas-admin) | MIT，约 4 stars | Next.js 管理台、用户、订阅页面结构 | 项目成熟度低，不能作为关键权限和账单底座 |

### 复用决策

| 子能力 | 决策 |
|---|---|
| Admin 框架 | **自研轻量 `/admin`**，沿用现有 Next.js、Signal Desk 和 SQLite |
| 图表 | 先复用现有 CSS/SVG；需要复杂图表时再借鉴 Tremor 模式 |
| 用户/额度/审计 | **自研**，属于产品核心运营数据，需与当前 `users`、`usage_log`、`usage_reservations` 对齐 |
| Web Vitals | 借鉴 `next-cwv-monitor` 的采集模型，**写入现有 SQLite 与分析事件体系** |
| Product Analytics | 不另接 PostHog/OpenPanel；先复用现有 `app_analytics_events` 并增加 Web 事件 |
| 错误/反馈 | 复用现有移动端诊断、内测反馈和内容举报 |

## 3. 推荐方案

### Phase 1：先让首页快起来

1. 把 `veyatv.com` 接入边缘 CDN/Cloudflare。
2. 静态资源走边缘缓存，Nginx/边缘启用 Brotli；保持 API 动态。
3. 将首页拆成轻量静态 Shell + 按需加载的工作区模块。
4. 首屏只加载总览、导航和当前项目所需代码；Agent、画布、生成、视频、小说模块按模式/步骤动态加载。
5. 建立真实用户 Web Vitals 采样，避免再次靠肉眼判断。

验收目标：

- 本地同构建 LCP p75 < 1.8 秒。
- 线上移动端 FCP p75 < 2.5 秒、LCP p75 < 4 秒作为首轮目标。
- 首页首屏 JS 传输从约 488 KB 降到 250 KB 以下。
- TTFB p75 相比当前 5–7 秒下降至少 60%。

本轮生产构建实测（本地隔离库，Chrome）：

| 视口 | FCP | LCP | CLS | TTFB | 首屏 JS |
|---|---:|---:|---:|---:|---:|
| Desktop 1440 | 1.04s | 1.04s | 0.046 | 10ms | 161 KB |
| Mobile 390 | 0.39s | 0.39s | 0.055 | 13ms | 161 KB |

- 无参数访问 `/` 由代理重写到轻量 `/start`；选择项目或开始创作后才加载完整工作区。
- 首页首屏传输已从约 488 KB 降到约 161 KB，达到 250 KB 以下目标。
- 线上 5–7 秒 TTFB 的根因仍是香港源站直连，部署后仍需接入 CDN/边缘缓存和 Brotli。
- Nginx 已改为直接提供 `/_next/static`，并配置一年不可变缓存与预压缩文件。

### Phase 2：运营后台 MVP

新增同站 `/admin`，只允许服务端管理员访问：

- 概览：注册用户、活跃用户、项目、生成任务、成功率、额度消耗、错误数。
- 用户：搜索、注册时间、最近活跃、项目数、会话、额度余额、订阅权益。
- 额度白名单：临时增量/覆盖日额度、生效及过期时间、原因、操作人。
- 分析：App/Web 事件、路径、版本、设备、错误和反馈。
- Web Vitals：FCP/LCP/INP/CLS/TTFB 的 p50/p75/p95，按路径、版本和端拆分。

数据表建议：

- `admin_users`：管理员身份与状态，不把角色硬编码进普通用户响应。
- `user_quota_overrides`：额度覆盖/白名单及过期时间。
- `admin_audit_log`：每次额度、用户和后台操作留痕。
- `web_vitals_events`：只存性能、路由、版本、设备与连接类型，不存正文。

后台明确不做：

- 直接读取或展示用户剧本、提示词、生成内容正文。
- 让运营修改计费价格表而不经过部署和审计。
- 完整 CRM、工单、复杂 RBAC 和团队审批链。
- 在首版接入 ClickHouse、PostHog、OpenPanel 等独立数据平台。

### Phase 3：稳定性闭环

- 后台增加异常阈值与告警。
- 对额度覆盖、封禁、退款类操作增加二次确认和审计。
- 根据真实 p75 数据继续拆分慢路由。

## 4. 建议本轮交付

本轮先完成 Phase 1 的性能基础设施和拆包，再交付 Phase 2 的第一个可用后台：

1. 首页轻量化与动态加载。
2. CDN/Brotli/静态缓存方案。
3. 管理员服务端鉴权。
4. 用户列表与额度白名单。
5. Web Vitals + 基础运营总览。

完成后再次实测 FCP/LCP，并用管理员账号走完“搜索用户 → 调整额度 → 查看审计 → 查看指标”的真实流程。

落地结果：

- `/admin` 已支持用户搜索、临时额度覆盖、撤销、审计和基础运营统计。
- Web Vitals 已采集 FCP、LCP、INP、CLS、TTFB，并按路径、设备、样本数展示 p50/p75/p95。
- 管理员桌面 1440 与移动 390 均完成真实流程和截图验收，无横向溢出。
