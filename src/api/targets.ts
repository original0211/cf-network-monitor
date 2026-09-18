// src/api/targets.ts
// GET  /api/targets        → 公开只读：白名单列表（不暴露敏感字段）
// POST /api/targets        → 需管理员鉴权：新增目标，写入前经过 SSRF 校验
// DELETE /api/targets/:id  → 需管理员鉴权：删除目标

import type { Env } from '../types';
import { jsonResponse, errorResponse } from '../utils/response';
import { listTargets, createTarget, deleteTarget } from '../services/targets.service';
import { isAuthorizedAdmin } from '../utils/auth';

const MAX_NAME_LEN = 128;
const MAX_ID_LEN = 64;
const MAX_URL_LEN = 512;
const ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export async function handleListTargets(env: Env): Promise<Response> {
  const targets = await listTargets(env, false);
  const publicView = targets.map((t) => ({
    id: t.id,
    name: t.name,
    region_label: t.region_label,
    enabled: t.enabled === 1,
  }));
  return jsonResponse({ targets: publicView });
}

interface CreateTargetBody {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  region_label?: unknown;
}

export async function handleCreateTarget(request: Request, env: Env): Promise<Response> {
  if (!isAuthorizedAdmin(request, env)) {
    return errorResponse('unauthorized', 401);
  }

  let body: CreateTargetBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse('invalid_json_body', 400);
  }

  if (
    typeof body.id !== 'string' ||
    typeof body.name !== 'string' ||
    typeof body.url !== 'string' ||
    body.id.length === 0 ||
    body.id.length > MAX_ID_LEN ||
    !ID_PATTERN.test(body.id) ||
    body.name.length === 0 ||
    body.name.length > MAX_NAME_LEN ||
    body.url.length === 0 ||
    body.url.length > MAX_URL_LEN
  ) {
    return errorResponse('invalid_input', 400);
  }

  const regionLabel = typeof body.region_label === 'string' ? body.region_label.slice(0, 64) : 'self-hosted';

  const result = await createTarget(env, {
    id: body.id,
    name: body.name,
    url: body.url,
    region_label: regionLabel,
  });

  if (!result.ok) {
    return errorResponse(result.reason ?? 'create_failed', 400);
  }

  return jsonResponse({ created: true, id: body.id }, 201);
}

export async function handleDeleteTarget(request: Request, env: Env, targetId: string): Promise<Response> {
  if (!isAuthorizedAdmin(request, env)) {
    return errorResponse('unauthorized', 401);
  }
  if (!ID_PATTERN.test(targetId)) {
    return errorResponse('invalid_target_id', 400);
  }
  await deleteTarget(env, targetId);
  return jsonResponse({ deleted: true, id: targetId });
}
