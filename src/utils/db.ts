// src/utils/db.ts
// D1 查询封装，统一错误处理与日志

import type { Env } from '../types';
import { logger } from './logger';

export async function d1All<T = Record<string, unknown>>(
  env: Env,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    const stmt = env.DB.prepare(sql).bind(...params);
    const result = await stmt.all<T>();
    return result.results ?? [];
  } catch (err) {
    logger.error('d1_query_failed', { sql, error: String(err) });
    throw err;
  }
}

export async function d1Run(
  env: Env,
  sql: string,
  params: unknown[] = []
): Promise<D1Result> {
  try {
    const stmt = env.DB.prepare(sql).bind(...params);
    return await stmt.run();
  } catch (err) {
    logger.error('d1_run_failed', { sql, error: String(err) });
    throw err;
  }
}

export async function d1First<T = Record<string, unknown>>(
  env: Env,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  try {
    const stmt = env.DB.prepare(sql).bind(...params);
    return await stmt.first<T>();
  } catch (err) {
    logger.error('d1_first_failed', { sql, error: String(err) });
    throw err;
  }
}
