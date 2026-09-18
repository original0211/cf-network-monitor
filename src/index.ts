// src/index.ts
// Worker 主入口：路由分发 + CORS + Cron 定时探测

import type { Env } from './types';
import { buildCorsHeaders, errorResponse } from './utils/response';
import { handlePing, handleManualProbe } from './api/probe';
import { handleListTargets, handleCreateTarget, handleDeleteTarget } from './api/targets';
import { handleHistory } from './api/history';
import { listTargets } from './services/targets.service';
import { probeAllTargets } from './services/probe.service';
import { recordProbeResult } from './services/state.service';
import { logger } from './utils/logger';
import { assertNoRawUrlParam } from './utils/ssrf-guard';

function withCors(response: Response, origin: string | null, allowedOrigins: string): Response {
  const corsHeaders = buildCorsHeaders(origin, allowedOrigins);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('origin');

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }), origin, env.ALLOWED_ORIGINS);
    }

    const rawUrlCheck = assertNoRawUrlParam(url.searchParams);
    if (!rawUrlCheck.ok) {
      logger.warn('rejected_raw_url_param', { path: url.pathname, reason: rawUrlCheck.reason });
      return withCors(errorResponse('forbidden_param', 400), origin, env.ALLOWED_ORIGINS);
    }

    try {
      let response: Response;

      if (url.pathname === '/api/ping' && request.method === 'GET') {
        response = await handlePing(request, env);
      } else if (url.pathname === '/api/probe/run' && request.method === 'POST') {
        response = await handleManualProbe(request, env);
      } else if (url.pathname === '/api/targets' && request.method === 'GET') {
        response = await handleListTargets(env);
      } else if (url.pathname === '/api/targets' && request.method === 'POST') {
        response = await handleCreateTarget(request, env);
      } else if (url.pathname.startsWith('/api/targets/') && request.method === 'DELETE') {
        const id = url.pathname.split('/').pop() ?? '';
        response = await handleDeleteTarget(request, env, id);
      } else if (url.pathname === '/api/history' && request.method === 'GET') {
        response = await handleHistory(request, env);
      } else if (url.pathname === '/healthz') {
        response = new Response('ok', { status: 200 });
      } else {
        response = errorResponse('not_found', 404);
      }

      return withCors(response, origin, env.ALLOWED_ORIGINS);
    } catch (err) {
      logger.error('unhandled_request_error', { path: url.pathname, error: String(err) });
      return withCors(errorResponse('internal_error', 500), origin, env.ALLOWED_ORIGINS);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    logger.info('cron_probe_started');
    const targets = await listTargets(env, true);
    const results = await probeAllTargets(targets);
    await Promise.all(results.map((r) => recordProbeResult(env, r)));
    logger.info('cron_probe_finished', { count: results.length });
  },
};
