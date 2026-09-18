// src/services/state.service.ts
// 读写 target_state（连续失败、最新状态），为故障自动标记提供数据支撑

import type { Env, ProbeResult } from '../types';
import { d1Run, d1First } from '../utils/db';

export async function recordProbeResult(env: Env, result: ProbeResult): Promise<void> {
  await d1Run(
    env,
    `INSERT INTO probe_results
      (target_id, dns_time_ms, tls_time_ms, ttfb_ms, total_time_ms, http_status, success, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      result.target_id,
      result.dns_time_ms,
      result.tls_time_ms,
      result.ttfb_ms,
      result.total_time_ms,
      result.http_status,
      result.success ? 1 : 0,
      result.error_message ?? null,
    ]
  );

  const state = await d1First<{ consecutive_failures: number }>(
    env,
    'SELECT consecutive_failures FROM target_state WHERE target_id = ?',
    [result.target_id]
  );

  const nextStreak = result.success ? 0 : (state?.consecutive_failures ?? 0) + 1;
  const status = result.success ? 'online' : nextStreak >= 3 ? 'offline' : 'degraded';

  await d1Run(
    env,
    `INSERT INTO target_state (target_id, consecutive_failures, last_status, last_checked_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(target_id) DO UPDATE SET
       consecutive_failures = excluded.consecutive_failures,
       last_status = excluded.last_status,
       last_checked_at = excluded.last_checked_at`,
    [result.target_id, nextStreak, status]
  );
}
