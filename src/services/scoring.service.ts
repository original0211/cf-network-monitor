// src/services/scoring.service.ts
// NodeScore = LatencyScore + AvailabilityScore + StabilityScore
// 三项均归一化到 0~100，总分满分 300，便于排序。
// 评分完全基于最近的实时探测数据，不按地理位置预设权重。

import type { NodeScoreBreakdown } from '../types';

export interface ScoringInput {
  target_id: string;
  recentLatenciesMs: number[];
  totalChecks: number;
  successChecks: number;
  consecutiveFailures: number;
}

const LATENCY_FLOOR_MS = 20;
const LATENCY_CEILING_MS = 2000;
const MAX_STABILITY_PENALTY_STREAK = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function computeLatencyScore(recentLatenciesMs: number[]): number {
  if (recentLatenciesMs.length === 0) return 0;
  const avg = recentLatenciesMs.reduce((a, b) => a + b, 0) / recentLatenciesMs.length;
  const ratio = (LATENCY_CEILING_MS - avg) / (LATENCY_CEILING_MS - LATENCY_FLOOR_MS);
  return Math.round(clamp(ratio, 0, 1) * 100);
}

export function computeAvailabilityScore(totalChecks: number, successChecks: number): number {
  if (totalChecks === 0) return 0;
  return Math.round((successChecks / totalChecks) * 100);
}

// 注意：totalChecks === 0 时必须返回 0，代表"没有任何历史数据，无从谈稳定"，
// 而不是错误地给未探测过的目标打满分（本地测试中发现并修复过的 bug）。
export function computeStabilityScore(
  consecutiveFailures: number,
  recentLatenciesMs: number[],
  totalChecks: number
): number {
  if (totalChecks === 0) return 0;

  if (consecutiveFailures > 0) {
    const penaltyRatio = clamp(consecutiveFailures / MAX_STABILITY_PENALTY_STREAK, 0, 1);
    return Math.round((1 - penaltyRatio) * 100 * 0.5);
  }
  if (recentLatenciesMs.length < 2) return 100;
  const mean = recentLatenciesMs.reduce((a, b) => a + b, 0) / recentLatenciesMs.length;
  const variance =
    recentLatenciesMs.reduce((sum, v) => sum + (v - mean) ** 2, 0) / recentLatenciesMs.length;
  const stdDev = Math.sqrt(variance);
  const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
  return Math.round(clamp(1 - coefficientOfVariation, 0, 1) * 100);
}

export function computeNodeScore(input: ScoringInput): NodeScoreBreakdown {
  const latency_score = computeLatencyScore(input.recentLatenciesMs);
  const availability_score = computeAvailabilityScore(input.totalChecks, input.successChecks);
  const stability_score = computeStabilityScore(
    input.consecutiveFailures,
    input.recentLatenciesMs,
    input.totalChecks
  );

  return {
    target_id: input.target_id,
    latency_score,
    availability_score,
    stability_score,
    total_score: latency_score + availability_score + stability_score,
  };
}
