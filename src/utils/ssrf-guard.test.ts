// src/utils/ssrf-guard.test.ts
import { describe, it, expect } from 'vitest';
import { validateTargetUrl, assertNoRawUrlParam } from './ssrf-guard';

describe('validateTargetUrl', () => {
  it('accepts a normal https URL', () => {
    expect(validateTargetUrl('https://api.brodydung.eu.org/health').ok).toBe(true);
  });

  it('rejects localhost', () => {
    expect(validateTargetUrl('http://localhost:8080/').ok).toBe(false);
  });

  it('rejects loopback IP', () => {
    expect(validateTargetUrl('http://127.0.0.1/admin').ok).toBe(false);
  });

  it('rejects private network ranges', () => {
    expect(validateTargetUrl('http://192.168.1.1/').ok).toBe(false);
    expect(validateTargetUrl('http://10.0.0.5/').ok).toBe(false);
    expect(validateTargetUrl('http://172.16.0.1/').ok).toBe(false);
  });

  it('rejects non-http protocols (file, ftp, gopher)', () => {
    expect(validateTargetUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateTargetUrl('ftp://example.com/').ok).toBe(false);
  });

  it('rejects credentials embedded in URL', () => {
    expect(validateTargetUrl('https://user:pass@example.com/').ok).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(validateTargetUrl('not-a-url').ok).toBe(false);
  });
});

describe('assertNoRawUrlParam', () => {
  it('blocks requests carrying a raw url param (anti open-proxy)', () => {
    const params = new URLSearchParams('url=https://evil.example.com');
    expect(assertNoRawUrlParam(params).ok).toBe(false);
  });

  it('allows requests without url-like params', () => {
    const params = new URLSearchParams('target_id=abc123');
    expect(assertNoRawUrlParam(params).ok).toBe(true);
  });
});
