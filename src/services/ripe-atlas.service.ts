// src/services/ripe-atlas.service.ts
// RIPE Atlas 集成：提供真实的多国网络测量（ping RTT / 丢包率）
// 文档：https://atlas.ripe.net/docs/apis/rest-api-manual/
//
// 重要说明：
// 1. RIPE Atlas 提供的是真实分布在各国的探针（probe），测量结果是真实数据。
// 2. 发起一次测量会消耗账户信用点（credits），免费额度有限，不在代码里硬编码具体数字，由调用方根据自己账户信用点余额控制频率。
// 3. 本服务只负责对接 API，不做任意目标转发，只能对 D1 targets 白名单中的 URL 发起测量。

import type { RipeMeasurementResult, SupportedRegionCode } from '../types';
import { logger } from '../utils/logger';

const RIPE_API_BASE = 'https://atlas.ripe.net/api/v2';

export const TARGET_COUNTRY_CODES: SupportedRegionCode[] = [
  'JP', 'SG', 'US', 'DE', 'GB', 'CA', 'AU', 'KR', 'HK', 'TW',
];

interface CreateMeasurementParams {
  apiKey: string;
  targetHostname: string;
  probesPerCountry?: number;
}

interface RipeCreateMeasurementResponse {
  measurements: number[];
}

export async function createPingMeasurement(
  params: CreateMeasurementParams
): Promise<number[]> {
  const { apiKey, targetHostname, probesPerCountry = 1 } = params;

  const body = {
    definitions: [
      {
        target: targetHostname,
        description: `cf-network-monitor ping to ${targetHostname}`,
        type: 'ping',
        af: 4,
        is_oneoff: true,
        packets: 3,
      },
    ],
    probes: TARGET_COUNTRY_CODES.map((country) => ({
      type: 'country',
      value: country,
      requested: probesPerCountry,
    })),
  };

  const resp = await fetch(`${RIPE_API_BASE}/measurements/`, {
    method: 'POST',
    headers: {
      authorization: `Key ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    logger.error('ripe_create_measurement_failed', { status: resp.status, body: text });
    throw new Error(`ripe_atlas_create_failed:${resp.status}`);
  }

  const json = (await resp.json()) as RipeCreateMeasurementResponse;
  return json.measurements;
}

interface RipeResultItem {
  prb_id: number;
  min?: number;
  avg?: number;
  max?: number;
  sent?: number;
  rcvd?: number;
}

export async function fetchMeasurementResults(
  apiKey: string,
  measurementId: number,
  targetId: string,
  probeCountryLookup: Map<number, string>
): Promise<RipeMeasurementResult[]> {
  const resp = await fetch(
    `${RIPE_API_BASE}/measurements/${measurementId}/results/?format=json`,
    { headers: { authorization: `Key ${apiKey}` } }
  );

  if (!resp.ok) {
    logger.error('ripe_fetch_results_failed', { status: resp.status, measurementId });
    return [];
  }

  const items = (await resp.json()) as RipeResultItem[];

  return items.map((item) => {
    const sent = item.sent ?? 0;
    const rcvd = item.rcvd ?? 0;
    const packetLoss = sent > 0 ? ((sent - rcvd) / sent) * 100 : 100;
    return {
      target_id: targetId,
      measurement_id: measurementId,
      probe_country: probeCountryLookup.get(item.prb_id) ?? 'UNKNOWN',
      probe_id: item.prb_id,
      rtt_ms: item.avg ?? null,
      packet_loss_pct: packetLoss,
      success: rcvd > 0,
    };
  });
}
