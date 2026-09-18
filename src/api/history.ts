// src/api/history.ts
// GET /api/history?target_id=xxx&hours=24 → 最近 N 小时历史探测记录，公开只读

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';
import { d1All } from '../utils/db';
import { getTargetById } from '../services/targets.service';

const MAX_HOURS = 24;
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

interface HistoryRow {
  total_time_ms: number | null;
  http_status: number | null;
  success: number;
  checked_at: string;
}

export async function handleHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const targetId = url.searchParams.get('target_id');
  const hoursParam = url.searchParams.get('hours');
  const hours = Math.min(Math.max(parseInt(hoursParam ?? '24', 10) || 24, 1), MAX_HOURS);

  if (!targetId || !ID_PATTERN.test(targetId)) {
    return errorResponse('invalid_or_missing_target_id', 400);
  }

  const target = await getTargetById(env, targetId);
  if (!target) {
    return errorResponse('target_not_found', 404);
  }

  const rows = await d1All<HistoryRow>(
    env,
    `SELECT total_time_ms, http_status, success, checked_at
     FROM probe_results
     WHERE target_id = ? AND checked_at >= datetime('now', ?)
     ORDER BY checked_at ASC`,
    [targetId, `-${hours} hours`]
  );

  return jsonResponse({
    target_id: targetId,
    hours,
    points: rows.map((r) => ({
      total_time_ms: r.total_time_ms,
      http_status: r.http_status,
      success: r.success === 1,
      checked_at: r.checked_at,
    })),
  });
}
