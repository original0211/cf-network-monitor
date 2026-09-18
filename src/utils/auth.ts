// src/utils/auth.ts
// 管理后台 / 写操作的鉴权。使用带时序安全比较，避免时序攻击

import type { Env } from '../types';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isAuthorizedAdmin(request: Request, env: Env): boolean {
  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${env.ADMIN_TOKEN}`;
  if (!env.ADMIN_TOKEN) return false;
  return timingSafeEqual(authHeader, expected);
}
