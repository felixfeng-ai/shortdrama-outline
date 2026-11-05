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
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  phone         TEXT UNIQUE,
  email         TEXT UNIQUE,
  display_name  TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS login_codes (
  id           TEXT PRIMARY KEY,
  phone        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   INTEGER NOT NULL,
  consumed_at  INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_login_codes (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  expires_at   INTEGER NOT NULL,
  consumed_at  INTEGER,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket            TEXT NOT NULL,
  subject           TEXT NOT NULL,
  window_started_at INTEGER NOT NULL,
  count             INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (bucket, subject)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_type   TEXT NOT NULL DEFAULT 'web',
  device_name   TEXT NOT NULL DEFAULT '',
  user_agent    TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  revoked_at    INTEGER
);

CREATE TABLE IF NOT EXISTS project_shares (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id       TEXT NOT NULL,
  token_hash     TEXT NOT NULL UNIQUE,
  created_at     INTEGER NOT NULL,
  expires_at     INTEGER NOT NULL,
  last_viewed_at INTEGER,
  revoked_at     INTEGER
);

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

-- 云端生成任务：先记账，再请求 Provider。Key 不落库，只保存非敏感请求元数据。
CREATE TABLE IF NOT EXISTS generation_tasks (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  provider_id  TEXT NOT NULL,
  model        TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  prompt_hash  TEXT NOT NULL,
  status       TEXT NOT NULL,
  error        TEXT,
  asset_id     TEXT,
  created_at   INTEGER NOT NULL,
  started_at   INTEGER,
  finished_at  INTEGER
);

-- 云端生成结果：像素落在数据目录，SQLite 只保存相对位置与元数据。
CREATE TABLE IF NOT EXISTS generated_assets (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES generation_tasks(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  storage_key  TEXT NOT NULL,
  mime         TEXT NOT NULL,
  bytes        INTEGER NOT NULL,
  provider_id  TEXT NOT NULL,
  model        TEXT NOT NULL,
  prompt       TEXT NOT NULL,
  selected_at  INTEGER,
  created_at   INTEGER NOT NULL
);

-- Web Push 设备订阅：endpoint 是浏览器推送服务地址，密钥只用于服务端加密推送。
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  UNIQUE (owner_id, endpoint)
);

-- 原生 App 推送 Token：只保存设备令牌与非敏感展示信息。
CREATE TABLE IF NOT EXISTS mobile_push_tokens (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  token       TEXT NOT NULL,
  platform    TEXT NOT NULL,
  device_name TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (owner_id, token)
);

-- 商店交易只保存凭据哈希和核验状态，原始收据不落库。
CREATE TABLE IF NOT EXISTS billing_transactions (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL,
  platform            TEXT NOT NULL,
  product_id          TEXT NOT NULL,
  transaction_id      TEXT NOT NULL,
  purchase_token_hash TEXT NOT NULL,
  status              TEXT NOT NULL,
  entitlement_json    TEXT NOT NULL DEFAULT '{}',
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  UNIQUE(owner_id, transaction_id)
);

CREATE TABLE IF NOT EXISTS content_reports (
  id           TEXT PRIMARY KEY,
  reporter_id  TEXT NOT NULL,
  project_id   TEXT,
  target_type  TEXT NOT NULL,
  target_id    TEXT NOT NULL,
  reason       TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_analytics_events (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL,
  install_id      TEXT NOT NULL,
  event_name      TEXT NOT NULL,
  path            TEXT NOT NULL DEFAULT '',
  properties_json TEXT NOT NULL DEFAULT '{}',
  created_at      INTEGER NOT NULL
);

-- 长文本分批生成断点：每个项目、每种产物只保留最新一份，不进入正式版本血缘。
CREATE TABLE IF NOT EXISTS text_generation_checkpoints (
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  signature    TEXT NOT NULL,
  cursor       INTEGER NOT NULL,
  state        TEXT NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (project_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_project_kind ON snapshots(project_id, kind);
CREATE INDEX IF NOT EXISTS idx_refs_project ON ref_images(project_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_lineage_to ON lineage(to_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_generation_tasks_project ON generation_tasks(project_id, target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_generated_assets_project ON generated_assets(project_id, target_type, target_id, created_at);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_owner ON push_subscriptions(owner_id);
CREATE INDEX IF NOT EXISTS idx_mobile_push_tokens_owner ON mobile_push_tokens(owner_id);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_owner ON billing_transactions(owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_content_reports_reporter ON content_reports(reporter_id, created_at);
CREATE INDEX IF NOT EXISTS idx_app_analytics_events_owner ON app_analytics_events(owner_id, created_at);
CREATE INDEX IF NOT EXISTS idx_login_codes_phone ON login_codes(phone, created_at);
CREATE INDEX IF NOT EXISTS idx_email_login_codes_email ON email_login_codes(email, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated ON auth_rate_limits(updated_at);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_project_shares_project ON project_shares(project_id, owner_id, expires_at);
`

const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "project-context",
    sql: `
      CREATE TABLE IF NOT EXISTS project_context (
        project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        brief_json    TEXT NOT NULL,
        look_json     TEXT NOT NULL,
        episode_count INTEGER NOT NULL,
        version       INTEGER NOT NULL,
        updated_by    TEXT,
        updated_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_context_updated
        ON project_context(updated_at);
    `,
  },
  {
    version: 2,
    name: "structured-decisions",
    sql: `
      CREATE TABLE IF NOT EXISTS project_decisions (
        id                    TEXT PRIMARY KEY,
        project_id            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        step                  TEXT NOT NULL,
        target_type           TEXT NOT NULL DEFAULT '',
        target_id             TEXT NOT NULL DEFAULT '',
        question              TEXT NOT NULL,
        options_json          TEXT NOT NULL,
        chosen_value          TEXT NOT NULL DEFAULT '',
        reason                TEXT NOT NULL DEFAULT '',
        status                TEXT NOT NULL,
        confidence            REAL,
        locked                INTEGER NOT NULL DEFAULT 0,
        owner_id              TEXT NOT NULL,
        based_on_snapshot_id  TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
        impact_json           TEXT NOT NULL DEFAULT '[]',
        created_at            INTEGER NOT NULL,
        updated_at            INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_judgments (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        step        TEXT NOT NULL,
        action      TEXT NOT NULL,
        reason      TEXT NOT NULL DEFAULT '',
        decision_id TEXT REFERENCES project_decisions(id) ON DELETE SET NULL,
        snapshot_id TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
        owner_id    TEXT NOT NULL,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_decisions_project
        ON project_decisions(project_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_project_judgments_project
        ON project_judgments(project_id, created_at);
    `,
  },
  {
    version: 3,
    name: "canon-facts",
    sql: `
      -- Canon 实体只保存稳定身份，不复制完整角色/地点快照；
      -- 同一项目下同一类型和名称只能有一个实体，避免“林远”出现多条身份。
      CREATE TABLE IF NOT EXISTS canon_entities (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind          TEXT NOT NULL,
        name          TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        UNIQUE (project_id, kind, name)
      );

      -- 一条事实表示某实体在一个集数闭区间内成立的状态。
      -- 外键级联保证删除项目时不会留下不可归属的 Canon 数据；
      -- 来源快照删除后只置空引用，事实本身仍保留供审计。
      CREATE TABLE IF NOT EXISTS canon_facts (
        id                 TEXT PRIMARY KEY,
        project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        entity_id          TEXT NOT NULL REFERENCES canon_entities(id) ON DELETE CASCADE,
        field              TEXT NOT NULL,
        value              TEXT NOT NULL,
        valid_from_episode INTEGER NOT NULL,
        valid_to_episode   INTEGER NOT NULL,
        source_snapshot_id TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
        locked             INTEGER NOT NULL DEFAULT 0,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL,
        UNIQUE (
          project_id, entity_id, field, value,
          valid_from_episode, valid_to_episode
        )
      );

      CREATE INDEX IF NOT EXISTS idx_canon_entities_project
        ON canon_entities(project_id, kind, name);
      CREATE INDEX IF NOT EXISTS idx_canon_facts_project
        ON canon_facts(project_id, entity_id, field, valid_from_episode);
    `,
  },
  {
    version: 4,
    name: "project-materials",
    sql: `
      CREATE TABLE IF NOT EXISTS project_materials (
        id              TEXT PRIMARY KEY,
        project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name            TEXT NOT NULL,
        kind            TEXT NOT NULL,
        mime            TEXT NOT NULL,
        bytes           INTEGER NOT NULL,
        content_hash    TEXT NOT NULL,
        content         TEXT NOT NULL,
        character_count INTEGER NOT NULL,
        truncated       INTEGER NOT NULL DEFAULT 0,
        created_by      TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        UNIQUE(project_id, content_hash)
      );
      CREATE INDEX IF NOT EXISTS idx_project_materials_project
        ON project_materials(project_id, updated_at);
    `,
  },
  {
    version: 5,
    name: "personal-skills",
    sql: `
      -- 个人 Skill 保存的是“创作方法”，不是某个项目的剧情内容。
      -- 版本单独成表：编辑 Skill 必须生成新版本，否则已绑定项目会悄悄换规则。
      CREATE TABLE IF NOT EXISTS personal_skills (
        id              TEXT PRIMARY KEY,
        owner_id        TEXT NOT NULL,
        name            TEXT NOT NULL,
        summary         TEXT NOT NULL DEFAULT '',
        current_version INTEGER NOT NULL,
        status          TEXT NOT NULL DEFAULT 'active',
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        UNIQUE(owner_id, name)
      );

      CREATE TABLE IF NOT EXISTS personal_skill_versions (
        id               TEXT PRIMARY KEY,
        skill_id         TEXT NOT NULL REFERENCES personal_skills(id) ON DELETE CASCADE,
        version          INTEGER NOT NULL,
        main_doc         TEXT NOT NULL,
        references_json  TEXT NOT NULL DEFAULT '[]',
        stage_rules_json TEXT NOT NULL DEFAULT '{}',
        acceptance_json  TEXT NOT NULL DEFAULT '[]',
        change_note      TEXT NOT NULL DEFAULT '',
        created_at       INTEGER NOT NULL,
        UNIQUE(skill_id, version)
      );

      -- 项目只保存“采用哪个 Skill 的哪个版本”。
      -- 这样 Skill 后续升级不会改变历史项目，重放时仍能解释当时的规则。
      CREATE TABLE IF NOT EXISTS project_skill_bindings (
        project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        skill_id      TEXT NOT NULL REFERENCES personal_skills(id) ON DELETE RESTRICT,
        skill_version INTEGER NOT NULL,
        applied_by    TEXT NOT NULL,
        applied_at    INTEGER NOT NULL,
        FOREIGN KEY(skill_id, skill_version)
          REFERENCES personal_skill_versions(skill_id, version) ON DELETE RESTRICT
      );

      CREATE INDEX IF NOT EXISTS idx_personal_skills_owner
        ON personal_skills(owner_id, status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_personal_skill_versions_skill
        ON personal_skill_versions(skill_id, version);
    `,
  },
  {
    version: 6,
    name: "entity-comments",
    sql: `
      -- 评论只锚定稳定实体 id，不保存“第几段文字”这类位置。
      -- 剧情文本会改，文字位置会漂移；稳定 id 才能让评论继续指向原对象。
      CREATE TABLE IF NOT EXISTS entity_comments (
        id          TEXT PRIMARY KEY,
        project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        target_type TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        target_name TEXT NOT NULL,
        body        TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'open',
        author_id   TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        resolved_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_entity_comments_project
        ON entity_comments(project_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_entity_comments_target
        ON entity_comments(project_id, target_type, target_id, status);
    `,
  },
  {
    version: 7,
    name: "reusable-asset-library",
    sql: `
      -- 跨项目资产只保存文字、引用和来源身份，不保存图片二进制或本地路径。
      -- 同名同类型采用版本递增，确保用户复用的是明确的一版，而不是被静默覆盖。
      CREATE TABLE IF NOT EXISTS reusable_assets (
        id                TEXT PRIMARY KEY,
        owner_id          TEXT NOT NULL,
        asset_type        TEXT NOT NULL,
        name              TEXT NOT NULL,
        source_project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        source_asset_id   TEXT NOT NULL DEFAULT '',
        content_json      TEXT NOT NULL,
        version           INTEGER NOT NULL,
        created_at        INTEGER NOT NULL,
        updated_at        INTEGER NOT NULL,
        UNIQUE(owner_id, asset_type, name)
      );
      CREATE INDEX IF NOT EXISTS idx_reusable_assets_owner
        ON reusable_assets(owner_id, asset_type, updated_at);
    `,
  },
  {
    version: 8,
    name: "project-collaboration",
    sql: `
      -- 会话属于项目和 owner，但消息不复制项目快照；因此多个会话看到的是同一项目事实。
      CREATE TABLE IF NOT EXISTS project_agent_threads (
        id         TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        owner_id   TEXT NOT NULL,
        title      TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS project_agent_messages (
        id         TEXT PRIMARY KEY,
        thread_id  TEXT NOT NULL REFERENCES project_agent_threads(id) ON DELETE CASCADE,
        role       TEXT NOT NULL,
        content    TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      -- 分支第一阶段只记录“从哪一版分叉”和目的，不复制快照内容。
      -- 这样不会制造两套难以同步的真相；后续真正分支时再按基线快照物化。
      CREATE TABLE IF NOT EXISTS project_branches (
        id                TEXT PRIMARY KEY,
        project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        owner_id          TEXT NOT NULL,
        name              TEXT NOT NULL,
        base_snapshot_id  TEXT NOT NULL REFERENCES snapshots(id) ON DELETE RESTRICT,
        note              TEXT NOT NULL DEFAULT '',
        created_at        INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_project_agent_threads_project
        ON project_agent_threads(project_id, owner_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_project_agent_messages_thread
        ON project_agent_messages(thread_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_project_branches_project
        ON project_branches(project_id, owner_id, created_at);
    `,
  },
  {
    version: 9,
    name: "short-drama-localization",
    sql: `
      -- 原始版使用 branch_id=''，因此旧项目、旧快照和旧查询行为不变。
      ALTER TABLE snapshots ADD COLUMN branch_id TEXT NOT NULL DEFAULT '';

      -- project_branches 从“基线记录”升级为可编辑工作分支。
      ALTER TABLE project_branches ADD COLUMN branch_type TEXT NOT NULL DEFAULT 'experiment';
      ALTER TABLE project_branches ADD COLUMN locale TEXT NOT NULL DEFAULT '';
      ALTER TABLE project_branches ADD COLUMN market TEXT NOT NULL DEFAULT '';
      ALTER TABLE project_branches ADD COLUMN source_language TEXT NOT NULL DEFAULT 'zh-CN';
      ALTER TABLE project_branches ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
      ALTER TABLE project_branches ADD COLUMN parent_branch_id TEXT;
      ALTER TABLE project_branches ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
      UPDATE project_branches SET updated_at = created_at WHERE updated_at = 0;

      CREATE INDEX IF NOT EXISTS idx_snapshots_branch_kind
        ON snapshots(project_id, branch_id, kind, version);
      CREATE INDEX IF NOT EXISTS idx_project_branches_type
        ON project_branches(project_id, branch_type, status, updated_at);
    `,
  },
  {
    version: 10,
    name: "localization-context-and-canon",
    sql: `
      CREATE TABLE IF NOT EXISTS project_branch_context (
        branch_id           TEXT PRIMARY KEY REFERENCES project_branches(id) ON DELETE CASCADE,
        project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        market_code         TEXT NOT NULL,
        platforms_json      TEXT NOT NULL DEFAULT '[]',
        content_rating      TEXT NOT NULL DEFAULT '',
        adaptation_json     TEXT NOT NULL DEFAULT '{}',
        subtitle_json       TEXT NOT NULL DEFAULT '{}',
        notes               TEXT NOT NULL DEFAULT '',
        version             INTEGER NOT NULL,
        updated_by          TEXT NOT NULL,
        updated_at          INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_branch_glossary (
        id             TEXT PRIMARY KEY,
        project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        branch_id      TEXT NOT NULL REFERENCES project_branches(id) ON DELETE CASCADE,
        source         TEXT NOT NULL,
        target         TEXT NOT NULL,
        kind           TEXT NOT NULL DEFAULT 'term',
        locked         INTEGER NOT NULL DEFAULT 0,
        case_sensitive INTEGER NOT NULL DEFAULT 0,
        notes          TEXT NOT NULL DEFAULT '',
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        UNIQUE(project_id, branch_id, source)
      );

      -- 分支事实单独成表，避免改变全球 Canon 的唯一约束与历史语义。
      CREATE TABLE IF NOT EXISTS project_branch_canon_facts (
        id                 TEXT PRIMARY KEY,
        project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        branch_id          TEXT NOT NULL REFERENCES project_branches(id) ON DELETE CASCADE,
        entity_id          TEXT NOT NULL REFERENCES canon_entities(id) ON DELETE CASCADE,
        field              TEXT NOT NULL,
        value              TEXT NOT NULL,
        valid_from_episode INTEGER NOT NULL,
        valid_to_episode   INTEGER NOT NULL,
        source_snapshot_id TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
        locked             INTEGER NOT NULL DEFAULT 0,
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL,
        UNIQUE(project_id, branch_id, entity_id, field, value, valid_from_episode, valid_to_episode)
      );

      CREATE INDEX IF NOT EXISTS idx_branch_context_project
        ON project_branch_context(project_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_branch_glossary_branch
        ON project_branch_glossary(project_id, branch_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_branch_canon_branch
        ON project_branch_canon_facts(project_id, branch_id, entity_id, field, valid_from_episode);
    `,
  },
  {
    version: 11,
    name: "localization-runs",
    sql: `
      -- 独立记录本地化长任务的游标与已产出内容。
      -- 不塞进通用 text_generation_checkpoints，避免同一项目多个市场分支互相覆盖。
      CREATE TABLE IF NOT EXISTS localization_runs (
        id                 TEXT PRIMARY KEY,
        project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        branch_id          TEXT NOT NULL REFERENCES project_branches(id) ON DELETE CASCADE,
        owner_id           TEXT NOT NULL,
        source_snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
        signature          TEXT NOT NULL,
        cursor             INTEGER NOT NULL DEFAULT 0,
        state_json         TEXT NOT NULL DEFAULT '{}',
        status             TEXT NOT NULL DEFAULT 'running',
        created_at         INTEGER NOT NULL,
        updated_at         INTEGER NOT NULL,
        UNIQUE(project_id, branch_id, signature)
      );
      CREATE INDEX IF NOT EXISTS idx_localization_runs_project
        ON localization_runs(project_id, branch_id, updated_at);
    `,
  },
  {
    version: 12,
    name: "localization-audits",
    sql: `
      CREATE TABLE IF NOT EXISTS localization_audits (
        id                 TEXT PRIMARY KEY,
        project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        branch_id          TEXT NOT NULL REFERENCES project_branches(id) ON DELETE CASCADE,
        owner_id           TEXT NOT NULL,
        source_snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
        report_json        TEXT NOT NULL,
        blocking           INTEGER NOT NULL,
        warnings           INTEGER NOT NULL,
        created_at         INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_localization_audits_branch
        ON localization_audits(project_id, branch_id, created_at);
    `,
  },
  {
    version: 13,
    name: "video-generation-tasks",
    sql: `
      ALTER TABLE generation_tasks ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image';
      ALTER TABLE generation_tasks ADD COLUMN batch_id TEXT;
      ALTER TABLE generation_tasks ADD COLUMN provider_task_id TEXT;
      ALTER TABLE generation_tasks ADD COLUMN provider_status TEXT;
      ALTER TABLE generation_tasks ADD COLUMN request_json TEXT NOT NULL DEFAULT '{}';
      ALTER TABLE generation_tasks ADD COLUMN pricing_version TEXT;
      ALTER TABLE generation_tasks ADD COLUMN estimated_cost_micros INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE generation_tasks ADD COLUMN actual_cost_micros INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE generation_tasks ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE generation_tasks ADD COLUMN attempt INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE generation_tasks ADD COLUMN retry_of_task_id TEXT;
      ALTER TABLE generation_tasks ADD COLUMN idempotency_key TEXT;
      ALTER TABLE generation_tasks ADD COLUMN next_poll_at INTEGER;

      ALTER TABLE generated_assets ADD COLUMN media_kind TEXT NOT NULL DEFAULT 'image';
      ALTER TABLE generated_assets ADD COLUMN duration_ms INTEGER;
      ALTER TABLE generated_assets ADD COLUMN width INTEGER;
      ALTER TABLE generated_assets ADD COLUMN height INTEGER;
      ALTER TABLE generated_assets ADD COLUMN fps REAL;
      ALTER TABLE generated_assets ADD COLUMN sha256 TEXT;
      ALTER TABLE generated_assets ADD COLUMN poster_storage_key TEXT;
      ALTER TABLE generated_assets ADD COLUMN source_asset_ids_json TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE generated_assets ADD COLUMN generation_meta_json TEXT NOT NULL DEFAULT '{}';

      CREATE TABLE IF NOT EXISTS generation_batches (
        id                    TEXT PRIMARY KEY,
        project_id            TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        episode               INTEGER NOT NULL DEFAULT 0,
        scope_json            TEXT NOT NULL DEFAULT '{}',
        status                TEXT NOT NULL DEFAULT 'draft',
        budget_limit_micros   INTEGER NOT NULL DEFAULT 0,
        reserved_cost_micros  INTEGER NOT NULL DEFAULT 0,
        actual_cost_micros    INTEGER NOT NULL DEFAULT 0,
        idempotency_key       TEXT,
        created_at            INTEGER NOT NULL,
        confirmed_at          INTEGER,
        finished_at           INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_generation_tasks_media
        ON generation_tasks(project_id, media_kind, status, next_poll_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_tasks_idempotency
        ON generation_tasks(project_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_generation_batches_idempotency
        ON generation_batches(project_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    `,
  },
  {
    version: 14,
    name: "episode-timelines",
    sql: `
      -- 草稿可变，版本不可变；两者按项目和集号隔离，避免跨集串稿。
      CREATE TABLE IF NOT EXISTS timeline_drafts (
        id            TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        episode       INTEGER NOT NULL,
        revision      INTEGER NOT NULL DEFAULT 1,
        payload_json  TEXT NOT NULL,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        UNIQUE(project_id, episode)
      );

      CREATE TABLE IF NOT EXISTS timeline_versions (
        id                 TEXT PRIMARY KEY,
        project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        episode            INTEGER NOT NULL,
        revision           INTEGER NOT NULL,
        payload_json       TEXT NOT NULL,
        input_hashes_json  TEXT NOT NULL DEFAULT '{}',
        created_at         INTEGER NOT NULL,
        UNIQUE(project_id, episode, revision)
      );

      CREATE INDEX IF NOT EXISTS idx_timeline_versions_project
        ON timeline_versions(project_id, episode, created_at);
    `,
  },
  {
    version: 15,
    name: "voice-profiles",
    sql: `
      -- 只保存系统预置音色绑定；一个项目内每个角色只有一条当前绑定。
      CREATE TABLE IF NOT EXISTS voice_profiles (
        id                  TEXT PRIMARY KEY,
        project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        character_entity_id TEXT NOT NULL,
        provider_id         TEXT NOT NULL,
        voice_id            TEXT NOT NULL,
        label               TEXT NOT NULL,
        speed               REAL NOT NULL DEFAULT 1,
        volume              REAL NOT NULL DEFAULT 1,
        created_at          INTEGER NOT NULL,
        updated_at          INTEGER NOT NULL,
        UNIQUE(project_id, character_entity_id)
      );

      CREATE INDEX IF NOT EXISTS idx_voice_profiles_project
        ON voice_profiles(project_id, updated_at);
    `,
  },
  {
    version: 16,
    name: "generated-assets-one-per-task",
    sql: `
      -- 视频轮询可能被多个页面同时触发；同一任务只能有一条落盘资产。
      -- 先清掉历史并发产生的重复行，保留任务当前引用、已采用或最早的一条。
      DELETE FROM generated_assets
      WHERE rowid IN (
        SELECT rowid
        FROM (
          SELECT
            rowid,
            ROW_NUMBER() OVER (
              PARTITION BY task_id
              ORDER BY
                CASE
                  WHEN EXISTS (
                    SELECT 1
                    FROM generation_tasks
                    WHERE generation_tasks.asset_id = generated_assets.id
                  ) THEN 0
                  ELSE 1
                END,
                CASE WHEN selected_at IS NOT NULL THEN 0 ELSE 1 END,
                created_at ASC,
                rowid ASC
            ) AS duplicate_rank
          FROM generated_assets
        )
        WHERE duplicate_rank > 1
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_assets_task_unique
        ON generated_assets(task_id);
    `,
  },
]

function applyMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[])
      .map((row) => Number(row.version)),
  )
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    db.exec("BEGIN IMMEDIATE")
    try {
      db.exec(migration.sql)
      db.prepare(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
      ).run(migration.version, migration.name, Date.now())
      db.exec("COMMIT")
    } catch (error) {
      db.exec("ROLLBACK")
      throw error
    }
  }
}

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
  applyMigrations(db)
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[]
  if (!projectColumns.some((column) => column.name === "owner_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN owner_id TEXT")
  }
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as {
    name: string
    notnull: number
  }[]
  const phoneColumn = userColumns.find((column) => column.name === "phone")
  const hasEmailColumn = userColumns.some((column) => column.name === "email")
  if (!hasEmailColumn || phoneColumn?.notnull === 1) {
    db.exec("PRAGMA foreign_keys = OFF")
    try {
      db.exec("DROP TABLE IF EXISTS users_next")
      db.exec("BEGIN IMMEDIATE")
      db.exec(`
        CREATE TABLE users_next (
          id            TEXT PRIMARY KEY,
          phone         TEXT UNIQUE,
          email         TEXT UNIQUE,
          display_name  TEXT NOT NULL,
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL,
          CHECK (phone IS NOT NULL OR email IS NOT NULL)
        )
      `)
      db.exec(`
        INSERT INTO users_next (id, phone, email, display_name, created_at, updated_at)
        SELECT id, phone, NULL, display_name, created_at, updated_at FROM users
      `)
      db.exec("DROP TABLE users")
      db.exec("ALTER TABLE users_next RENAME TO users")
      db.exec("COMMIT")
    } catch (error) {
      try {
        db.exec("ROLLBACK")
      } catch {
        // 迁移未进入事务时无需回滚
      }
      throw error
    } finally {
      db.exec("PRAGMA foreign_keys = ON")
    }
  }
  const authSessionColumns = db.prepare("PRAGMA table_info(auth_sessions)").all() as { name: string }[]
  if (!authSessionColumns.some((column) => column.name === "client_type")) {
    db.exec("ALTER TABLE auth_sessions ADD COLUMN client_type TEXT NOT NULL DEFAULT 'web'")
  }
  if (!authSessionColumns.some((column) => column.name === "device_name")) {
    db.exec("ALTER TABLE auth_sessions ADD COLUMN device_name TEXT NOT NULL DEFAULT ''")
  }
  if (!authSessionColumns.some((column) => column.name === "user_agent")) {
    db.exec("ALTER TABLE auth_sessions ADD COLUMN user_agent TEXT NOT NULL DEFAULT ''")
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id, updated_at)")
  // 额度表也在这里建：它和资产链共用同一个库文件，分开建会导致测试用
  // `:memory:` 时只建了一半的表结构
  ensureQuotaSchema(db)
  return db
}
