-- migrations/0001_init.sql
-- 目标白名单表：系统只允许探测这张表里登记过的地址，防止 SSRF / 开放代理
CREATE TABLE IF NOT EXISTS targets (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL UNIQUE,
  region_label  TEXT NOT NULL DEFAULT 'self-hosted',
  owner_verified INTEGER NOT NULL DEFAULT 1,
  enabled       INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 每次 HTTP 探测结果（来自 Worker 本地探测）
CREATE TABLE IF NOT EXISTS probe_results (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id     TEXT NOT NULL REFERENCES targets(id),
  dns_time_ms   REAL,
  tls_time_ms   REAL,
  ttfb_ms       REAL,
  total_time_ms REAL,
  http_status   INTEGER,
  success       INTEGER NOT NULL,
  error_message TEXT,
  checked_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_probe_results_target_time
  ON probe_results(target_id, checked_at DESC);

-- 来自 RIPE Atlas 的真实跨国测量结果
CREATE TABLE IF NOT EXISTS ripe_measurements (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id       TEXT NOT NULL REFERENCES targets(id),
  measurement_id  INTEGER NOT NULL,
  probe_country   TEXT NOT NULL,
  probe_id        INTEGER NOT NULL,
  rtt_ms          REAL,
  packet_loss_pct REAL,
  success         INTEGER NOT NULL,
  measured_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ripe_target_country_time
  ON ripe_measurements(target_id, probe_country, measured_at DESC);

-- 连续失败计数，用于评分 StabilityScore 与故障标记
CREATE TABLE IF NOT EXISTS target_state (
  target_id           TEXT PRIMARY KEY REFERENCES targets(id),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_status         TEXT NOT NULL DEFAULT 'unknown',
  last_checked_at     TEXT
);
