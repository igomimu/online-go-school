import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppVersionCheck } from './useAppVersionCheck';

/**
 * 2026-08-26: version.json は40文字のフルハッシュ、アプリが持つのは
 * `git rev-parse --short` の7文字。そのまま比べたので必ず食い違い、
 * 読み込み直しても帯が出続けた。長さの違いを吸収できているかの回帰。
 *
 * __COMMIT_HASH__ は vite が define で埋める。テストでは
 * vitest.config の define か、下の宣言で 'testhash' が入る前提。
 */
declare const __COMMIT_HASH__: string;

describe('版の食い違いの検出', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  const mockVersion = (version: string) => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version }),
    }) as unknown as typeof fetch;
  };

  it('配信中の版が自分と同じなら、知らせない（短縮ハッシュとフルハッシュ）', async () => {
    const mine = __COMMIT_HASH__;
    // 実際の version.json と同じ形。短縮ハッシュを含む40文字
    mockVersion(mine + 'a'.repeat(Math.max(0, 40 - mine.length)));

    const { result } = renderHook(() => useAppVersionCheck());
    await vi.runOnlyPendingTimersAsync();

    expect(result.current.updateAvailable).toBe(false);
  });

  it('配信中の版が違えば知らせる', async () => {
    mockVersion('9'.repeat(40));

    const { result } = renderHook(() => useAppVersionCheck());
    await vi.runOnlyPendingTimersAsync();

    expect(result.current.updateAvailable).toBe(true);
  });

  it('version.json が読めなくても、知らせない', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;

    const { result } = renderHook(() => useAppVersionCheck());
    await vi.runOnlyPendingTimersAsync();

    expect(result.current.updateAvailable).toBe(false);
  });
});
