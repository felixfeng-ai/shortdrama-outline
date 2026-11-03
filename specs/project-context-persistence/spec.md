# 项目创作上下文持久化

## 目标

把创作意图、视觉宪法和集数从浏览器偏好升级为服务端项目资产，支持跨设备恢复、项目隔离和后续结构化决策。

## 能力点

### P1 数据库迁移基础

- 新增 `schema_migrations`，记录已执行的迁移版本、名称和时间。
- 项目上下文通过编号迁移创建，不依赖下次全量重建数据库。
- 同一迁移重复执行必须幂等。
- `project_context` 随项目删除级联清理。

### P2 服务端项目上下文

- `project_context` 保存 Brief、LookBook、集数、版本、更新人和更新时间。
- 读取时必须校验项目归属；无权项目返回 403。
- 写入时重新规范化文本：
  - Brief 使用 `readBrief`。
  - LookBook 使用 `readLook`。
  - 集数夹在 6–120。
- 首次写入创建 `version = 1`，后续写入递增版本。
- 客户端可携带当前 `version` 做乐观锁；版本不一致返回 409，避免跨设备静默覆盖。

### P3 旧本地数据迁移

- 打开项目时优先读取服务端上下文。
- 服务端没有记录时，读取该项目的旧 `localStorage`：
  - `chengju:brief:<projectId>`
  - `chengju:look:<projectId>`
  - `chengju:episodes:<projectId>`
- 迁移成功后继续保留本地缓存，不删除旧数据。
- 判断日志本阶段继续保存在本地，等待结构化决策模块迁移。

### P4 保存与降级

- 用户修改 Brief、LookBook 或集数后：
  - 立即写本地缓存。
  - 短暂防抖后写服务端。
- 服务端保存失败不阻断当前创作，但下一次打开仍可依赖本地缓存。
- 项目切换时不能把上一个项目的上下文写入新项目。

## 不在本阶段

- 判断日志服务端迁移
- 结构化决策记录
- 多人实时编辑
- Canon

## 验收场景

1. Given 新项目，When PUT 项目上下文，Then 创建 version 1 并规范化字段。
2. Given version 1，When 携带 version 1 更新，Then 返回 version 2。
3. Given version 1，When 另一客户端携带过期 version 更新，Then 返回 409。
4. Given 浏览器已有本地 Brief/Look/集数，When 首次打开旧项目，Then 自动写入服务端并保留本地缓存。
5. Given 未登录匿名项目，When 读取和写入上下文，Then 只能访问当前匿名 owner 的项目。
6. Given 项目删除，When 查询 `project_context`，Then 对应记录已被级联删除。
7. Given 服务端暂时不可用，When 用户继续修改，Then 本地缓存仍可恢复，页面不崩。
