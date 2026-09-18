// src/utils/ssrf-guard.ts
// 防 SSRF / 防开放代理的核心安全模块
// 规则：系统绝不接受用户传入的任意 URL。
// 所有探测目标必须来自 D1 targets 表白名单，本模块只负责对白名单中的 URL 做二次校验。

const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
];

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export interface SsrfCheckResult {
  ok: boolean;
  reason?: string;
}

export function validateTargetUrl(rawUrl: string): SsrfCheckResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'INVALID_URL_FORMAT' };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: 'PROTOCOL_NOT_ALLOWED' };
  }

  const hostname = parsed.hostname;
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { ok: false, reason: 'PRIVATE_OR_LOOPBACK_HOST_BLOCKED' };
    }
  }

  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'CREDENTIALS_IN_URL_NOT_ALLOWED' };
  }

  return { ok: true };
}

/**
 * 业务层入口：给定一个要探测的 targetId，必须先从 D1 查到对应 URL，
 * 不允许任何 API 接受 `?url=` 这类参数直接发起请求。
 */
export function assertNoRawUrlParam(searchParams: URLSearchParams): SsrfCheckResult {
  if (searchParams.has('url') || searchParams.has('target_url') || searchParams.has('endpoint')) {
    return { ok: false, reason: 'RAW_URL_PARAM_FORBIDDEN' };
  }
  return { ok: true };
}
