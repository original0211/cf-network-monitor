// src/api/probe.ts
// GET /api/ping        → 公开只读：每个目标的最新状态 + NodeScore，支持按延迟/可用率排序
// POST /api/probe/run  → 需管理员鉴权 + 限流：手动触发一次全量探测

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';
import { listTargets } from '../services/targets.service';
import { probeAllTargets } from '../services/probe.service';
import { recordProbeResult } from '../services/state.service';
import { computeNodeScore } from '../services/scoring.service';
import { d1All } from '../utils/db';
import { isAuthorizedAdmin } from '../utils/auth';
import { checkRateLimit } from '../utils/rate-limit';
import { logger } from '../utils/logger';

const RECENT_WINDOW_LIMIT = 20;

interface RecentRow {
  total_time_ms: number | null;
  success: number;
}

export async function handlePing(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const sortBy = url.searchParams.get('sort');

  const targets = await listTargets(env, true);

  const rows = await Promise.all(
    targets.map(async (t) => {
      const recent = await d1All<RecentRow>(
        env,
        'SELECT total_time_ms, success FROM probe_results WHERE target_id = ? ORDER BY checked_at DESC LIMIT ?',
        [t.id, RECENT_WINDOW_LIMIT]
      );
      const state = await d1All<{ consecutive_failures: number; last_status: string; last_checked_at: string }>(
        env,
        'SELECT consecutive_failures, last_status, last_checked_at FROM target_state WHERE target_id = ?',
        [t.id]
      );

      const successRows = recent.filter((r) => r.success === 1);
      const latencies = successRows
        .map((r) => r.total_time_ms)
        .filter((v): v is number => v !== null);

      const score = computeNodeScore({
        target_id: t.id,
        recentLatenciesMs: latencies,
        totalChecks: recent.length,
        successChecks: successRows.length,
        consecutiveFailures: state[0]?.consecutive_failures ?? 0,
      });

      const avgLatency =
        latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null;

      return {
        target_id: t.id,
        name: t.name,
        region_label: t.region_label,
        avg_latency_ms: avgLatency,
        availability_pct: score.availability_score,
        status: state[0]?.last_status ?? 'unknown',
        last_checked_at: state[0]?.last_checked_at ?? null,
        score,
      };
    })
  );

  if (sortBy === 'latency') {
    rows.sort((a, b) => (a.avg_latency_ms ?? Infinity) - (b.avg_latency_ms ?? Infinity));
  } else if (sortBy === 'availability') {
    rows.sort((a, b) => b.availability_pct - a.availability_pct);
  } else {
    rows.sort((a, b) => b.score.total_score - a.score.total_score);
  }

  return jsonResponse({ generated_at: new Date().toISOString(), nodes: rows });
}

export async function handleManualProbe(request: Request, env: Env): Promise<Response> {
  if (!isAuthorizedAdmin(request, env)) {
    return errorResponse('unauthorized', 401);
  }

  const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rate = await checkRateLimit(env, `manual_probe:${clientIp}`, 6);
  if (!rate.allowed) {
    return errorResponse('rate_limited', 429);
  }

  const targets = await listTargets(env, true);
  const results = await probeAllTargets(targets);
  await Promise.all(results.map((r) => recordProbeResult(env, r)));

  logger.info('manual_probe_triggered', { count: results.length, ip: clientIp });
  return jsonResponse({ triggered: results.length, results });
}
