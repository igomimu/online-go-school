import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 教室に meeting がまだ無い状態で2人が同時に入ってきたときの収束を守るテスト。
 * 負けたほうが自分の作った meeting を返してしまい、同じ教室なのに別の部屋に
 * 分かれていた（2026-09-07 Codex レビュー #4）。
 */

type Result = { data: unknown; error: { message: string } | null };

let selectResults: Result[] = [];
let updateResult: Result = { data: null, error: null };

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => selectResults.shift() ?? { data: null, error: null },
        }),
      }),
      update: () => ({
        eq: () => ({
          is: () => ({
            select: () => ({ maybeSingle: async () => updateResult }),
          }),
        }),
      }),
    }),
  }),
}));

const { resolveMeetingId } = await import('./realtimeKit');

const cfg = { accountId: 'acc', appId: 'app', apiToken: 'tok' };
const call = () => resolveMeetingId(cfg, 'https://example.supabase.co', 'service-role-key', 'go-CLASS1');

beforeEach(() => {
  selectResults = [];
  updateResult = { data: null, error: null };
  // RealtimeKit へ meeting を作りに行くと、必ず自分の meeting-2 が返る状況にする
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: true, data: { id: 'meeting-2' } }),
  })));
});

describe('resolveMeetingId', () => {
  it('教室に meeting が既にあれば、作らずにそれを返す', async () => {
    selectResults = [{ data: { realtime_meeting_id: 'meeting-1' }, error: null }];
    await expect(call()).resolves.toBe('meeting-1');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('競争に勝ったら、自分が作った meeting を返す', async () => {
    selectResults = [{ data: { realtime_meeting_id: null }, error: null }];
    updateResult = { data: { realtime_meeting_id: 'meeting-2' }, error: null };
    await expect(call()).resolves.toBe('meeting-2');
  });

  it('競争に負けたら、DBに採用された meeting を読み直して返す', async () => {
    selectResults = [
      { data: { realtime_meeting_id: null }, error: null },   // 最初の確認: まだ無い
      { data: { realtime_meeting_id: 'meeting-1' }, error: null }, // 読み直し: 相手のが入っている
    ];
    updateResult = { data: null, error: null }; // 条件付き UPDATE は該当行なしで返る
    await expect(call()).resolves.toBe('meeting-1');
  });

  it('書き込みが失敗したら例外にする', async () => {
    selectResults = [{ data: { realtime_meeting_id: null }, error: null }];
    updateResult = { data: null, error: { message: 'permission denied' } };
    await expect(call()).rejects.toThrow('permission denied');
  });
});
