// src/services/targets.service.ts
// 目标白名单的 CRUD，所有写操作都需要管理员鉴权，写入前必须通过 SSRF 校验

import type { Env, Target } from '../types';
import { d1All, d1Run, d1First } from '../utils/db';
import { validateTargetUrl } from '../utils/ssrf-guard';

export async function listTargets(env: Env, onlyEnabled = true): Promise<Target[]> {
  const sql = onlyEnabled
    ? 'SELECT * FROM targets WHERE enabled = 1 ORDER BY created_at DESC'
    : 'SELECT * FROM targets ORDER BY created_at DESC';
  return d1All<Target>(env, sql);
}

export async function getTargetById(env: Env, id: string): Promise<Target | null> {
  return d1First<Target>(env, 'SELECT * FROM targets WHERE id = ?', [id]);
}

export interface CreateTargetInput {
  id: string;
  name: string;
  url: string;
  region_label: string;
}

export interface CreateTargetResult {
  ok: boolean;
  reason?: string;
}

export async function createTarget(env: Env, input: CreateTargetInput): Promise<CreateTargetResult> {
  const urlCheck = validateTargetUrl(input.url);
  if (!urlCheck.ok) {
    return { ok: false, reason: urlCheck.reason };
  }

  if (!input.id || !input.name || input.id.length > 64 || input.name.length > 128) {
    return { ok: false, reason: 'INVALID_INPUT_LENGTH' };
  }

  await d1Run(
    env,
    'INSERT INTO targets (id, name, url, region_label, owner_verified, enabled) VALUES (?, ?, ?, ?, 1, 1)',
    [input.id, input.name, input.url, input.region_label || 'self-hosted']
  );
  await d1Run(
    env,
    'INSERT OR IGNORE INTO target_state (target_id, consecutive_failures, last_status) VALUES (?, 0, ?)',
    [input.id, 'unknown']
  );

  return { ok: true };
}

export async function setTargetEnabled(env: Env, id: string, enabled: boolean): Promise<void> {
  await d1Run(env, 'UPDATE targets SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
}

export async function deleteTarget(env: Env, id: string): Promise<void> {
  await d1Run(env, 'DELETE FROM targets WHERE id = ?', [id]);
  await d1Run(env, 'DELETE FROM target_state WHERE target_id = ?', [id]);
}
