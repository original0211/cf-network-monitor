// src/utils/rate-limit.ts
// 基于 KV 的简易固定窗口限流，防止滥用 /api/probe 手动测速接口消耗免费额度
// 注意：固定窗口算法存在边界突发问题，但对于免费层防滥用足够

import type { Env } from '../types';

const WINDOW_SECONDS = 60;

export async function checkRateLimit(
  env: Env,
  identifier: string,
  maxRequests: number
): Promise<{ allowed: boolean; remaining: number }> {
  const windowBucket = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const key = `ratelimit:${identifier}:${windowBucket}`;

  const currentRaw = await env.STATUS_KV.get(key);
  const current = currentRaw ? parseInt(currentRaw, 10) : 0;

  if (current >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  await env.STATUS_KV.put(key, String(current + 1), { expirationTtl: WINDOW_SECONDS * 2 });
  return { allowed: true, remaining: maxRequests - current - 1 };
}
