-- Knot MVP SQLite Schema v1.1
-- 基础：v0.5 产品方向 + I-01 历史不覆写约束
-- 日期：2026-10-28

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ============================================================
-- 表 1: assets（资产表，只追加）
-- 约束：I-01 历史不覆写
-- ============================================================

CREATE TABLE IF NOT EXISTS assets (
    asset_id        TEXT PRIMARY KEY,           -- UUID v4
    content_hash    TEXT NOT NULL UNIQUE,       -- SHA-256
    media_type      TEXT NOT NULL,              -- 'text/markdown' / 'application/json' / ...
    content_blob    BLOB,                       -- 小文件内嵌；大文件 NULL + file_path
    file_path       TEXT,                       -- 外部对象存储路径（按 hash 组织）
    source_uri      TEXT,                       -- 原始来源：file:// / conversation:// / ...
    created_at      INTEGER NOT NULL,           -- Unix timestamp (ms)
    imported_at     INTEGER NOT NULL,           -- 导入时间
    metadata_json   TEXT,                       -- 扩展元数据（JSON）
    CHECK (content_blob IS NOT NULL OR file_path IS NOT NULL)
);

CREATE INDEX idx_assets_hash ON assets(content_hash);
CREATE INDEX idx_assets_created ON assets(created_at);
CREATE INDEX idx_assets_media ON assets(media_type);

-- ============================================================
-- 表 2: history_events（历史事件表，只追加）
-- 约束：I-01 历史不覆写，recorded_at >= event_time
-- ============================================================

CREATE TABLE IF NOT EXISTS history_events (
    event_id        TEXT PRIMARY KEY,           -- UUID v4
    event_type      TEXT NOT NULL,              -- 'import' / 'user_confirm' / 'agent_propose' / 'trust_update'
    subject         TEXT,                       -- 事件主体（asset_id / user / agent）
    source          TEXT,                       -- 来源标识
    event_time      INTEGER NOT NULL,           -- 事件实际发生时间
    recorded_at     INTEGER NOT NULL,           -- 写入时间（>= event_time）
    target_assets   TEXT,                       -- JSON array of asset_id
    evidence_refs   TEXT,                       -- JSON array of event_id（证据链）
    payload_json    TEXT,                       -- 事件负载（JSON）
    CHECK (recorded_at >= event_time)
);

CREATE INDEX idx_events_type ON history_events(event_type);
CREATE INDEX idx_events_time ON history_events(event_time);
CREATE INDEX idx_events_recorded ON history_events(recorded_at);
CREATE INDEX idx_events_subject ON history_events(subject);

-- ============================================================
-- 表 3: horn_rules（Horn 规则表，固定正向）
-- 第一版：硬编码规则，rule_version = 1
-- ============================================================

CREATE TABLE IF NOT EXISTS horn_rules (
    rule_id         INTEGER PRIMARY KEY AUTOINCREMENT,
    head            TEXT NOT NULL,              -- 原子命题（字符串）
    body            TEXT NOT NULL,              -- JSON array of atoms（前提）
    rule_version    INTEGER NOT NULL DEFAULT 1, -- 规则版本
    active          INTEGER NOT NULL DEFAULT 1, -- 是否启用
    description     TEXT
);

CREATE INDEX idx_rules_head ON horn_rules(head);
CREATE INDEX idx_rules_version ON horn_rules(rule_version);

-- ============================================================
-- 表 4: eligible_snapshots（信任快照表）
-- 约束：I-01 不覆写历史评价
-- ============================================================

CREATE TABLE IF NOT EXISTS eligible_snapshots (
    snapshot_id     TEXT PRIMARY KEY,           -- UUID v4
    snapshot_time   INTEGER NOT NULL,           -- 快照时间
    event_id        TEXT NOT NULL,              -- 来源事件 ID
    is_eligible     INTEGER NOT NULL,           -- 1=可信, 0=降级
    trust_level     TEXT,                       -- 'trusted' / 'conditional' / 'revoked'
    reason          TEXT,                       -- 变更原因
    FOREIGN KEY (event_id) REFERENCES history_events(event_id) ON DELETE RESTRICT
);

CREATE INDEX idx_eligible_event ON eligible_snapshots(event_id);
CREATE INDEX idx_eligible_time ON eligible_snapshots(snapshot_time);

-- ============================================================
-- 表 5: claims_candidates（候选关系表，非确认事实）
-- 约束：I-02 声明与事实分离
-- ============================================================

CREATE TABLE IF NOT EXISTS claims_candidates (
    claim_id        TEXT PRIMARY KEY,           -- UUID v4
    claim_type      TEXT NOT NULL,              -- 'relation' / 'question' / 'decision' / 'counterexample'
    atom            TEXT NOT NULL,              -- 目标原子
    support_sources TEXT,                       -- JSON array of event_id（支持来源）
    extraction_method TEXT NOT NULL,            -- 'rule_based' / 'llm_propose' / 'user_input'
    confidence      REAL,                       -- 0.0 ~ 1.0（可选）
    unverified      INTEGER NOT NULL DEFAULT 1, -- 1=未核验, 0=用户已确认
    user_response   TEXT,                       -- 'accept' / 'reject' / 'modify' / NULL
    proposed_at     INTEGER NOT NULL,
    reviewed_at     INTEGER
);

CREATE INDEX idx_claims_atom ON claims_candidates(atom);
CREATE INDEX idx_claims_type ON claims_candidates(claim_type);
CREATE INDEX idx_claims_unverified ON claims_candidates(unverified);

-- ============================================================
-- 表 6: continuation_bundles（续接包表）
-- ============================================================

CREATE TABLE IF NOT EXISTS continuation_bundles (
    bundle_id       TEXT PRIMARY KEY,           -- UUID v4
    created_at      INTEGER NOT NULL,
    user_scoped     INTEGER NOT NULL DEFAULT 0, -- 是否用户确认作用域
    authorized_assets TEXT NOT NULL,            -- JSON array of asset_id
    support_view_snapshot TEXT,                 -- JSON: {atom: {boolean, minimal_roots}}
    open_questions  TEXT,                       -- JSON array
    context_text    TEXT,                       -- 生成的上下文文本（待用户审查）
    exported        INTEGER NOT NULL DEFAULT 0  -- 是否已导出
);

CREATE INDEX idx_bundles_created ON continuation_bundles(created_at);
CREATE INDEX idx_bundles_exported ON continuation_bundles(exported);

-- ============================================================
-- FTS5 全文索引（资产内容）
-- ============================================================

-- BEGIN FTS v1.1
CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
    asset_id UNINDEXED,
    content,
    tokenize='unicode61 remove_diacritics 2'
);

-- FTS5 触发器：保持同步
CREATE TRIGGER IF NOT EXISTS assets_fts_insert AFTER INSERT ON assets
WHEN new.content_blob IS NOT NULL BEGIN
    INSERT INTO assets_fts(rowid, asset_id, content)
    VALUES (new.rowid, new.asset_id, CAST(new.content_blob AS TEXT));
END;

CREATE TRIGGER IF NOT EXISTS assets_fts_delete AFTER DELETE ON assets BEGIN
    DELETE FROM assets_fts WHERE rowid = old.rowid;
END;
-- END FTS v1.1

-- ============================================================
-- 初始化规则（v1.0 硬编码）
-- ============================================================

INSERT OR IGNORE INTO horn_rules (head, body, rule_version, description) VALUES
    ('decision', '["question", "evidence"]', 1, '决策需要问题和证据'),
    ('question', '[]', 1, '问题是基础原子'),
    ('evidence', '[]', 1, '证据是基础原子'),
    ('counterexample', '[]', 1, '反例是基础原子'),
    ('conditional_theorem', '["premise", "proof"]', 1, '条件性定理需要前提和证明'),
    ('open_question', '["question"]', 1, '未决问题基于问题'),
    ('support_relation', '["evidence", "decision"]', 1, '支持关系连接证据和决策');

-- ============================================================
-- Schema 版本记录
-- ============================================================

CREATE TABLE IF NOT EXISTS schema_version (
    version         TEXT PRIMARY KEY,
    applied_at      INTEGER NOT NULL,
    description     TEXT
);

INSERT OR REPLACE INTO schema_version (version, applied_at, description)
VALUES ('1.0', strftime('%s', 'now') * 1000, 'Initial MVP schema with I-01/I-02 constraints');

INSERT OR IGNORE INTO schema_version (version, applied_at, description)
VALUES ('1.1', strftime('%s', 'now') * 1000, 'Self-contained FTS index; explicit unindexed assets');
