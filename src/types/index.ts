// src/types/index.ts
// 全局共享类型定义，不包含任何业务逻辑

export interface Env {
  DB: D1Database;
  STATUS_KV: KVNamespace;
  ADMIN_TOKEN: string;
  RIPE_ATLAS_API_KEY: string;
  ALLOWED_ORIGINS: string;
  ENVIRONMENT: string;
}

export interface Target {
  id: string;
  name: string;
  url: string;
  region_label: string;
  owner_verified: number;
  enabled: number;
  created_at: string;
}

export interface ProbeResult {
  target_id: string;
  dns_time_ms: number | null;
  tls_time_ms: number | null;
  ttfb_ms: number | null;
  total_time_ms: number | null;
  http_status: number | null;
  success: boolean;
  error_message?: string;
}

export interface RipeMeasurementResult {
  target_id: string;
  measurement_id: number;
  probe_country: string;
  probe_id: number;
  rtt_ms: number | null;
  packet_loss_pct: number | null;
  success: boolean;
}

export interface NodeScoreBreakdown {
  target_id: string;
  latency_score: number;
  availability_score: number;
  stability_score: number;
  total_score: number;
}

export type SupportedRegionCode =
  | 'JP' | 'SG' | 'US' | 'DE' | 'GB' | 'CA' | 'AU' | 'KR' | 'HK' | 'TW';
