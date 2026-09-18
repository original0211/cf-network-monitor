// src/services/probe.service.ts
// 本地 HTTP/HTTPS 探测服务
//
// 重要诚实声明：Cloudflare Workers 的 fetch() 运行在沙箱中，不暴露底层 socket 事件，
// 无法单独拆分出 "DNS 解析时间" 和 "TLS 握手时间"，这两项在本地探测中始终为 null。
// 真实的网络层指标（RTT、丢包率）由 RIPE Atlas 服务提供，两者互补。
// 本服务能可靠提供的指标：TTFB（fetch() promise resolve 时刻，即响应头到达时间）、总耗时、HTTP 状态码、成功/失败。

import type { ProbeResult, Target } from '../types';
import { validateTargetUrl } from '../utils/ssrf-guard';
import { logger } from '../utils/logger';

const PROBE_TIMEOUT_MS = 8000;

export async function probeTarget(target: Target): Promise<ProbeResult> {
  const urlCheck = validateTargetUrl(target.url);
  if (!urlCheck.ok) {
    logger.warn('probe_blocked_by_ssrf_guard', { target_id: target.id, reason: urlCheck.reason });
    return {
      target_id: target.id,
      dns_time_ms: null,
      tls_time_ms: null,
      ttfb_ms: null,
      total_time_ms: null,
      http_status: null,
      success: false,
      error_message: `blocked_by_ssrf_guard:${urlCheck.reason}`,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const t0 = Date.now();

  try {
    const response = await fetch(target.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'cf-network-monitor/1.0 (+self-hosted health check)' },
    });
    const ttfb = Date.now() - t0;

    const reader = response.body?.getReader();
    if (reader) {
      await reader.read();
      await reader.cancel().catch(() => undefined);
    }
    const totalTime = Date.now() - t0;

    return {
      target_id: target.id,
      dns_time_ms: null,
      tls_time_ms: null,
      ttfb_ms: ttfb,
      total_time_ms: totalTime,
      http_status: response.status,
      success: response.status >= 200 && response.status < 500,
    };
  } catch (err) {
    const totalTime = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('probe_failed', { target_id: target.id, error: message });
    return {
      target_id: target.id,
      dns_time_ms: null,
      tls_time_ms: null,
      ttfb_ms: null,
      total_time_ms: totalTime,
      http_status: null,
      success: false,
      error_message: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function probeAllTargets(targets: Target[]): Promise<ProbeResult[]> {
  return Promise.all(targets.map((t) => probeTarget(t)));
}
