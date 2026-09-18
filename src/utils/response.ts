// src/utils/response.ts
// 统一 JSON 响应 + CORS 白名单处理，避免每个路由重复写

export function jsonResponse(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function buildCorsHeaders(origin: string | null, allowedOriginsCsv: string): Record<string, string> {
  const allowed = allowedOriginsCsv.split(',').map((o) => o.trim());
  const isAllowed = origin !== null && allowed.includes(origin);
  return {
    'access-control-allow-origin': isAllowed ? origin! : 'null',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    vary: 'origin',
  };
}
