// src/services/ripe-collector.service.ts
// 定时任务专用：拉取已发起但尚未收集结果的 RIPE Atlas 测量。
// 只发 GET 请求，不消耗 RIPE Atlas 信用点，可以安全地每次 Cron 都跑。

import type { Env } from '../types';
import { d1All, d1Run } from '../utils/db';
import { fetchMeasurementResults } from './ripe-atlas.service';
import { logger } from '../utils/logger';

interface PendingRow {
  measurement_id: number;
  target_id: string;
}

export async function collectPendingRipeMeasurements(env: Env): Promise<number> {
  if (!env.RIPE_ATLAS_API_KEY) {
    logger.warn('ripe_collect_skipped_no_api_key');
    return 0;
  }

  const pending = await d1All<PendingRow>(
    env,
    'SELECT measurement_id, target_id FROM ripe_pending_measurements WHERE collected = 0 LIMIT 10'
  );

  let collectedCount = 0;

  for (const row of pending) {
    try {
      const results = await fetchMeasurementResults(env.RIPE_ATLAS_API_KEY, row.measurement_id, row.target_id);

      if (results.length === 0) {
        continue;
      }

      for (const r of results) {
        await d1Run(
          env,
          `INSERT INTO ripe_measurements
            (target_id, measurement_id, probe_country, probe_id, rtt_ms, packet_loss_pct, success)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [r.target_id, r.measurement_id, r.probe_country, r.probe_id, r.rtt_ms, r.packet_loss_pct, r.success ? 1 : 0]
        );
      }

      await d1Run(
        env,
        'UPDATE ripe_pending_measurements SET collected = 1 WHERE measurement_id = ?',
        [row.measurement_id]
      );
      collectedCount += results.length;
    } catch (err) {
      logger.error('ripe_collect_failed', { measurement_id: row.measurement_id, error: String(err) });
    }
  }

  return collectedCount;
}
