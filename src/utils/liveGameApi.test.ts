import { beforeEach, describe, expect, it, vi } from 'vitest';

// getSupabase が実クライアントを作らないようにする（テストでは認証を通さない＝匿名扱い）
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: null } }) },
    realtime: { setAuth: () => {} },
  }),
}));

import { deleteSavedGames } from './liveGameApi';

describe('deleteSavedGames（棋譜の一括削除）', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_DOJO_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_DOJO_SUPABASE_KEY', 'test-key');
    vi.restoreAllMocks();
  });

  it('選んだ棋譜をすべて削除し、進み具合を知らせる', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      calls.push(body.game_id);
      expect(body.action).toBe('delete_saved_game');
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }));

    const progress: Array<[number, number]> = [];
    const result = await deleteSavedGames(['a', 'b', 'c'], (done, total) => progress.push([done, total]));

    expect(result.deleted.sort()).toEqual(['a', 'b', 'c']);
    expect(result.failed).toEqual([]);
    expect(calls.sort()).toEqual(['a', 'b', 'c']);
    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]]);
  });

  it('途中で失敗しても残りを消し、消せなかった分を返す', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.game_id === 'b') {
        return { ok: false, json: async () => ({ error: 'Forbidden' }) } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }));

    const result = await deleteSavedGames(['a', 'b', 'c']);

    expect(result.deleted.sort()).toEqual(['a', 'c']);
    expect(result.failed).toEqual([{ id: 'b', error: 'Forbidden' }]);
  });

  it('1件も選んでいなければ何もしない', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await deleteSavedGames([]);

    expect(result).toEqual({ deleted: [], failed: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
