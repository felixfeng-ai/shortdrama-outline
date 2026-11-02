# 生产数据备份与恢复

## 目标

为当前单机 SQLite 部署补齐可执行的数据保护流程：数据库写锁等待、在线一致性备份、生成图片备份、完整性校验、可验证恢复和保留策略。

## 能力点

### D1 SQLite 并发等待

- 每次打开数据库时设置 `busy_timeout = 5000`。
- 短暂写锁竞争应等待最多 5 秒，而不是立即返回 `SQLITE_BUSY`。
- 原有 WAL、外键和表结构行为保持不变。

### D2 一致性备份

- 提供 `node scripts/backup-data.mjs`。
- 默认数据目录为 `CHENGJU_DATA_DIR` 或 `./data`。
- 默认备份目录为 `<数据目录>/backups`，可用 `CHENGJU_BACKUP_DIR` 覆盖。
- 先使用 SQLite `VACUUM INTO` 生成一致性数据库快照，再复制 `generated/` 图片。
- 快照后执行 `PRAGMA integrity_check`，结果必须为 `ok`。
- 备份目录包含 `chengju.db`、`generated/`、`manifest.json`。
- manifest 记录时间、数据库 SHA-256、生成图片文件数量、总字节数和逐文件哈希。
- 备份不包含 `.env`、API Key、会话 Cookie 或其他秘密。

### D3 恢复校验

- 提供 `node scripts/restore-data.mjs <备份目录> <目标目录>`。
- 必须设置 `CHENGJU_RESTORE_CONFIRM=1` 才执行。
- 恢复前重新校验 manifest、数据库哈希、SQLite 完整性和图片文件哈希。
- 默认拒绝写入已存在且非空的目录，不直接覆盖生产数据。
- 恢复产物写入新目录，供人工检查后再替换生产目录。

### D4 保留策略

- 默认保留最近 7 份备份，可用 `CHENGJU_BACKUP_KEEP` 调整。
- 只清理带有效 manifest 的备份目录，不删除未知文件。

## 不在本次范围

- 远程对象存储上传
- 跨服务器复制
- 加密备份
- 自动修改 PM2 或系统 cron
- 在线原地恢复

## 验收场景

1. Given 任意新数据库连接，When 读取 `PRAGMA busy_timeout`，Then 返回 5000。
2. Given 数据库和生成图片目录，When 执行备份，Then 快照可打开、完整性为 ok、图片与 manifest 哈希一致。
3. Given 合法备份，When 恢复到新目录，Then 数据库数据和图片内容一致。
4. Given 被篡改的数据库或图片，When 恢复，Then 在写入目标目录前拒绝。
5. Given 超过保留数量的备份，When 再次备份，Then 只保留最新 N 份有效备份。
6. Given 未设置恢复确认，When 执行恢复，Then 拒绝执行。
