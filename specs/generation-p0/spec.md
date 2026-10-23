# 成剧 P0：文生图与关键帧资产

> 状态：用户已确认进入 P0 实施。
> 范围：角色定妆图、镜头首帧、平台默认通义万相、生成任务与关键帧资产卡。

## 1. 目标

让用户在成剧内用一次明确的云端调用，把已经确认的角色锚点或镜头提示词变成可预览、
可重生成、可回选的关键帧，同时保留角色、场景、分镜现有的版本与项目隔离。

## 2. 硬边界

- 本地参考图的二进制内容不得随生成请求上传；服务端只接收文本提示词。
- 云端生成必须由用户主动点击触发，且不得把模型部署成本转嫁给编剧。
- 图像 API Key 只存在服务端环境变量，不进入浏览器、不写数据库、不写日志。
- 云端生成出的关键帧属于当前项目；未授权会话不能读取。
- 本轮不接图生视频、配音、字幕、合片。

## 3. 能力与场景

### G1 平台默认图像服务

**Requirement**：普通用户不需要理解 Provider、模型和 API Key。平台服务端默认使用阿里云通义万相。

**Scenario G1.1**
Given 用户点击“生成定妆图”或“生成首帧”
When 系统构造图像请求
Then 使用服务端 `ALIYUN_DASHSCOPE_API_KEY` 与 `ALIYUN_IMAGE_MODEL` 调用通义万相，前端不要求填写 Provider、模型或 Key。

**Scenario G1.2**
Given 通义万相先返回任务 id，随后任务变为成功
When 系统轮询结果
Then 下载 `output.results[].url` 的图片并保存为项目关键帧；失败和超时都进入失败任务。

**Scenario G1.3**
Given 服务端未配置通义万相 Key
When 用户生成关键帧
Then 返回“平台图像服务未配置”的可读提示，不出现用户级 API Key 输入框。

### G2 生成任务

**Requirement**：每次生成都必须先建立任务，再进入运行、成功或失败状态。

**Scenario G2.1**
Given 用户提交合法的项目、目标和 Provider 配置
When 请求进入服务端
Then 任务以 `queued` 入库，并在调用 Provider 前变为 `running`。

**Scenario G2.2**
Given Provider 成功返回图片
When 图片通过格式与大小校验
Then 图片落为项目资产，任务变为 `succeeded`，并记录资产 id。

**Scenario G2.3**
Given Provider 超时、拒绝或返回非图片内容
When 请求失败
Then 任务变为 `failed`，返回可读中文错误，且不创建半成品资产。

### G3 关键帧资产

**Requirement**：关键帧按项目和目标隔离，并保留历史版本。

**Scenario G3.1**
Given 某角色或镜头已经生成多张关键帧
When 用户打开资产卡
Then 能看到版本历史，并默认选中最近采用或最近成功的一张。

**Scenario G3.2**
Given 用户点选旧版本
When 选择请求成功
Then 该版本成为当前关键帧，但旧资产不删除。

**Scenario G3.3**
Given 两个不同的匿名会话
When 任一方向生成资产接口发请求
Then 只能访问自己项目的关键帧。

### G4 角色定妆图

**Requirement**：角色定妆卡可以直接生成角色关键帧。

**Scenario G4.1**
Given 角色定妆已有英文出图提示词
When 用户点击“生成定妆图”
Then 使用该角色稳定 `entityId`、英文提示词和竖版尺寸创建生成请求。

### G5 镜头首帧

**Requirement**：分镜卡可以直接生成镜头首帧。

**Scenario G5.1**
Given 镜头已有英文分镜提示词
When 用户点击“生成首帧”
Then 使用该镜头稳定 `entityId`、提示词和镜头画幅创建生成请求。

**Scenario G5.2**
Given 生成任务正在运行
When 用户重复点击
Then 按钮禁用，不产生重复任务。

### G6 体验与降级

**Requirement**：生成状态、错误和隐私边界必须可见。

**Scenario G6.1**
Given 用户尚未配置 Key
When 点击生成
Then 展开 Provider 配置，不发送请求。

**Scenario G6.2**
Given 用户关闭或刷新页面
When 服务端已有历史关键帧
Then 重新进入项目后可以恢复并显示这些资产。

**Scenario G6.3**
Given 用户开启减少动效
When 生成状态变化
Then 关键帧卡不使用位移或无限动画表达状态。

### G7 下载与项目包

**Requirement**：生成出的关键帧必须能单独下载，也必须能随项目包带走。

**Scenario G7.1**
Given 某个目标已经采用了一张关键帧
When 用户点击“下载关键帧”
Then 浏览器直接下载该图片，文件名包含目标类型和稳定 id。

**Scenario G7.2**
Given 项目里已有角色或镜头关键帧
When 用户导出项目包
Then `project.json` 包含全部关键帧的非二进制元数据，ZIP 包含每个已采用关键帧的实际文件。

**Scenario G7.3**
Given 某张历史关键帧未被采用
When 导出项目包
Then 元数据仍保留在 manifest 中，但 ZIP 只包含当前采用版本，避免重复占用空间。

## 4. 数据契约

- `generation_tasks`：项目、目标、Provider、模型、提示词摘要、状态、错误、资产 id、时间。
- `generated_assets`：项目、目标、文件路径、MIME、字节数、Provider、模型、提示词、采用时间。
- 文件存于 `CHENGJU_DATA_DIR/generated/<projectId>/`，数据库只存相对路径。
- 删除项目时同时删除对应生成目录。

## 5. 验收

- 新增逻辑层测试覆盖 Provider 归一、配置校验、文件签名、DB 隔离与采用状态。
- 现有全量测试、TypeScript 与生产构建通过。
- 浏览器验证角色定妆卡与镜头首帧卡在桌面、窄屏无重叠；不读取任何图片文件。
