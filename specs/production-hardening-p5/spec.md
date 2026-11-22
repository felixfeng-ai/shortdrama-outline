# Production Hardening P5

> 本轮把内部镜头视频生成加入核心浏览器门禁，使用本地 mock 供应商，不产生真实费用。

## R1 可隔离的供应商地址

- `MINIMAX_VIDEO_BASE_URL` 可在服务端测试环境覆盖。
- 默认值仍为正式 MiniMax 地址。
- 公开视频能力接口不得泄露 Base URL、API Key 或其他供应商配置。
- 任务提交、状态查询和取消必须使用同一配置地址。

## R2 本地 mock 供应商

Given E2E 启动隔离应用服务
Then 同时启动本地 HTTP mock 服务
And mock 实现：

- `POST /v2/video_generation` 返回稳定 task id
- `GET /v2/query/video_generation/:id` 返回成功状态与本地 MP4 URL
- `GET /mock.mp4` 返回真实可下载 MP4
- `DELETE /v2/video_generation/:id` 返回成功

## R3 浏览器内部生成闭环

Given 示例项目已具备已采用首帧
When 用户在镜头视频工作区选择 1 镜并提交生成
Then 页面显示真实任务进度
And 轮询成功后出现内部生成候选
And 采用候选后成为当前镜头视频
And 动态分镜继续读取同一条采用事实
And 此前的候选版本仍保留

## 浏览器验收

- 桌面与 390px 覆盖生成候选、采用结果，无横向溢出。
- E2E 断言 mock 收到的模型、分辨率与 5 秒时长。
- 不调用真实 MiniMax。

## 非目标

- 不在 CI 中调用任何真实付费供应商。
- 不新增其它视频供应商。
- 不改变时间线、动态分镜或候选的数据结构。
