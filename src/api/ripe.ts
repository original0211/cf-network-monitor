// src/api/ripe.ts
// POST /api/ripe/run      → 需管理员鉴权：对指定目标发起一次十国真实 RIPE Atlas 测量（消耗信用点，需谨慎调用）
// GET  /api/ripe/history  → 公开只读：查看已收集到的各国测量历史

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';
import { getTargetById } from '../services/targets.service';
import { createPingMeasurement } from '../services/ripe-atlas.service';
import { isAuthorizedAdmin } from '../utils/auth';
import { checkRateLimit } from '../utils/rate-limit';
import { d1Run, d1All } from '../utils/db';
import { logger } from '../utils/logger';

const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export async function handleRipeRun(request: Request, env: Env): Promise<Response> {
  if (!isAuthorizedAdmin(request, env)) {
    return errorResponse('unauthorized', 401);
  }

  if (!env.RIPE_ATLAS_API_KEY) {
    return errorResponse('ripe_atlas_api_key_not_configured', 500);
  }

  const clientIp = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const rate = await checkRateLimit(env, `ripe_run:${clientIp}`, 2);
  if (!rate.allowed) {
    return errorResponse('rate_limited', 429);
  }

  let body: { target_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_json_body', 400);
  }

  if (typeof body.target_id !== 'string' || !ID_PATTERN.test(body.target_id)) {
    return errorResponse('invalid_target_id', 400);
  }

  const target = await getTargetById(env, body.target_id);
  if (!target) {
    return errorResponse('target_not_found', 404);
  }

  let hostname: string;
  try {
    hostname = new URL(target.url).hostname;
  } catch {
    return errorResponse('target_url_invalid', 400);
  }

  try {
    const measurementIds = await createPingMeasurement({
      apiKey: env.RIPE_ATLAS_API_KEY,
      targetHostname: hostname,
      probesPerCountry: 1,
    });

    for (const measurementId of measurementIds) {
      await d1Run(
        env,
        'INSERT OR IGNORE INTO ripe_pending_measurements (measurement_id, target_id) VALUES (?, ?)',
        [measurementId, target.id]
      );
    }

    logger.info('ripe_measurement_created', { target_id: target.id, measurementIds });
    return jsonResponse({ created: true, target_id: target.id, measurement_ids: measurementIds });
  } catch (err) {
    logger.error('ripe_run_failed', { target_id: target.id, error: String(err) });
    return errorResponse('ripe_atlas_request_failed', 502);
  }
}

interface RipeHistoryRow {
  probe_country: string;
  rtt_ms: number | null;
  packet_loss_pct: number | null;
  success: number;
  measured_at: string;
}

export async function handleRipeHistory(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const targetId = url.searchParams.get('target_id');

  if (!targetId || !ID_PATTERN.test(targetId)) {
    return errorResponse('invalid_or_missing_target_id', 400);
  }

  const target = await getTargetById(env, targetId);
  if (!target) {
    return errorResponse('target_not_found', 404);
  }

  const rows = await d1All<RipeHistoryRow>(
    env,
    `SELECT probe_country, rtt_ms, packet_loss_pct, success, measured_at
     FROM ripe_measurements
     WHERE target_id = ?
     ORDER BY measured_at DESC
     LIMIT 200`,
    [targetId]
  );

  return jsonResponse({ target_id: targetId, results: rows });
}
