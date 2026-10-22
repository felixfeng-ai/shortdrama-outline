// 资产链的存储层：SQLite 单文件。
//
// 设计约束（见 SDD v0.2 §2）：
//   1. 只存「文本」与「引用」——绝不含图像二进制（原则 P1）
//   2. 库文件放在项目目录之外，避免 git reset --hard / .next 构建覆盖（F4）
//   3. 建表幂等，重复 open 不报错（F4）
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
// 额度控制的表结构独立在 lib/quota.ts（那一层不属于「资产链」，是运营侧的限流）
import { ensureQuotaSchema } from "../quota.ts"

/**
 * 数据目录：默认项目外的 data/，可用 CHENGJU_DATA_DIR 覆盖（部署时指向 /opt/chengju/data）。
 *
 * 这里必须对「空字符串 / 字面量 undefined」做兜底：环境变量可以存在但为空，
 * 调用方也可能把未定义的值直接拼进路径，两种都会产出 "undefined/xxx.db"
 * ——在仓库根建一个名为 undefined 的目录。测试进程尤其容易踩到（见 tests/loader.mjs），
 * 所以在解析路径这一步就挡掉，而不是指望每个调用点都自觉。
 */
export function getDataDir(): string {
  const configured = process.env.CHENGJU_DATA_DIR?.trim()
  const usable = configured && configured !== "undefined" ? configured : null
  return usable ?? path.join(process.cwd(), "data")
}

export function defaultDbPath(): string {
  return path.join(getDataDir(), "chengju.db")
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  owner_id   TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  version    INTEGER NOT NULL,
  payload    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (project_id, kind, version)
);

-- 血缘：一条边 = 下游快照依赖上游快照
CREATE TABLE IF NOT EXISTS lineage (
  from_snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  to_snapshot_id   TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  PRIMARY KEY (from_snapshot_id, to_snapshot_id)
);

-- 图台账：只有引用与指纹，绝不含图像二进制（原则 P1）
-- vault_key 指向用户本地图库里的位置，图永远不经过服务端
CREATE TABLE IF NOT EXISTS ref_images (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vault_key  TEXT NOT NULL,
  label      TEXT NOT NULL,
  file_hash  TEXT NOT NULL,
  mime       TEXT NOT NULL,
  bytes      INTEGER NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project_kind ON snapshots(project_id, kind);
CREATE INDEX IF NOT EXISTS idx_refs_project ON ref_images(project_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_lineage_to ON lineage(to_snapshot_id);
`

/**
 * 打开（并在需要时初始化）数据库。
 * - 目录不存在会自动创建
 * - 传入 ":memory:" 时可用于测试
 */
export function openDb(dbPath: string = defaultDbPath()): DatabaseSync {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const db = new DatabaseSync(dbPath)
  db.exec(SCHEMA)
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]
  if (!projectColumns.some((column) => column.name === "owner_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN owner_id TEXT")
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id, updated_at)")
  // 额度表也在这里建：它和资产链共用同一个库文件，分开建会导致测试用
  // `:memory:` 时只建了一半的表结构
  ensureQuotaSchema(db)
  return db
}
