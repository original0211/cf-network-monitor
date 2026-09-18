// src/services/scoring.service.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeLatencyScore,
  computeAvailabilityScore,
  computeStabilityScore,
  computeNodeScore,
} from './scoring.service';

describe('computeLatencyScore', () => {
  it('returns 0 when there is no data', () => {
    expect(computeLatencyScore([])).toBe(0);
  });

  it('returns a high score for low latency', () => {
    expect(computeLatencyScore([30, 32, 31])).toBeGreaterThan(90);
  });

  it('returns a low score for latency near the ceiling', () => {
    expect(computeLatencyScore([1900, 2000, 1950])).toBeLessThan(10);
  });
});

describe('computeAvailabilityScore', () => {
  it('returns 0 when totalChecks is 0 (no fake full marks for untested targets)', () => {
    expect(computeAvailabilityScore(0, 0)).toBe(0);
  });

  it('returns 100 for a perfect record', () => {
    expect(computeAvailabilityScore(10, 10)).toBe(100);
  });

  it('returns 70 for 7/10 successes', () => {
    expect(computeAvailabilityScore(10, 7)).toBe(70);
  });
});

describe('computeStabilityScore', () => {
  it('returns 0 when totalChecks is 0, regression guard for the untested-target bug', () => {
    expect(computeStabilityScore(0, [], 0)).toBe(0);
  });

  it('penalizes consecutive failures, capped at 50 for a single failure', () => {
    const score = computeStabilityScore(1, [], 10);
    expect(score).toBeLessThanOrEqual(50);
    expect(score).toBeGreaterThan(0);
  });

  it('drops to 0 once consecutive failures reach the max streak', () => {
    expect(computeStabilityScore(10, [], 10)).toBe(0);
  });

  it('penalizes high jitter even with zero failures', () => {
    const jittery = computeStabilityScore(0, [20, 500, 30, 600, 25], 5);
    const steady = computeStabilityScore(0, [30, 32, 31, 29, 33], 5);
    expect(jittery).toBeLessThan(steady);
  });
});

describe('computeNodeScore', () => {
  it('sums the three sub-scores', () => {
    const result = computeNodeScore({
      target_id: 't1',
      recentLatenciesMs: [30, 32, 31],
      totalChecks: 10,
      successChecks: 10,
      consecutiveFailures: 0,
    });
    expect(result.total_score).toBe(
      result.latency_score + result.availability_score + result.stability_score
    );
  });

  it('gives an untested target a total score of 0, not a default full score', () => {
    const result = computeNodeScore({
      target_id: 't2',
      recentLatenciesMs: [],
      totalChecks: 0,
      successChecks: 0,
      consecutiveFailures: 0,
    });
    expect(result.total_score).toBe(0);
  });
});
