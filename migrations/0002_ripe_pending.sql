-- migrations/0002_ripe_pending.sql
-- 记录已发起但尚未拉取结果的 RIPE Atlas 测量任务
CREATE TABLE IF NOT EXISTS ripe_pending_measurements (
  measurement_id  INTEGER PRIMARY KEY,
  target_id       TEXT NOT NULL REFERENCES targets(id),
  requested_at    TEXT NOT NULL DEFAULT (datetime('now')),
  collected       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ripe_pending_collected
  ON ripe_pending_measurements(collected, requested_at);
