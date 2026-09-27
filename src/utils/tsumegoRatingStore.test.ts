import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabase } from './liveGameApi';
import {
  loadTsumegoRatingFromServer,
  recordTsumegoResultOnServer,
  resetTsumegoRatingOnServer,
  startTsumegoRatingOnServer,
} from './tsumegoRatingStore';

vi.mock('./liveGameApi', () => ({ getSupabase: vi.fn() }));

describe('tsumegoRatingStore', () => {
  beforeEach(() => vi.mocked(getSupabase).mockReset());

  it('生徒アカウントに保存した行を格付け状態へ戻す', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        student_login_id: '1001', rank_id: 'bronze_3', points: 2,
        consecutive_wins: 1, protection_count: 0, total_solved: 8,
        total_attempts: 12, highest_rank_id: 'bronze_3',
        last_updated: '2026-09-27T00:00:00.000Z',
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    vi.mocked(getSupabase).mockReturnValue({ from: () => ({ select }) } as never);

    await expect(loadTsumegoRatingFromServer('1001')).resolves.toEqual(expect.objectContaining({
      rankId: 'bronze_3', points: 2, totalAttempts: 12,
    }));
    expect(eq).toHaveBeenCalledWith('student_login_id', '1001');
  });

  it('壊れた格付け行は読み込まない', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        student_login_id: '1001', rank_id: 'unknown', points: 99,
        consecutive_wins: 0, protection_count: 0, total_solved: 0,
        total_attempts: 0, highest_rank_id: 'unknown', last_updated: 'invalid',
      },
      error: null,
    });
    vi.mocked(getSupabase).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    } as never);
    await expect(loadTsumegoRatingFromServer('1001')).resolves.toBeNull();
  });

  const serverRow = (over: Record<string, unknown> = {}) => ({
    student_login_id: '1001', rank_id: 'silver_4', points: 0,
    consecutive_wins: 0, protection_count: 0, total_solved: 0,
    total_attempts: 0, highest_rank_id: 'silver_4',
    last_updated: '2026-09-27T00:00:00.000Z', ...over,
  });

  it('初期格はサーバーの関数で決め、返ってきた格（既存があればそれ）を使う', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: serverRow({ rank_id: 'gold_2', highest_rank_id: 'gold_2' }), error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);

    await expect(startTsumegoRatingOnServer('silver_4')).resolves.toEqual(expect.objectContaining({ rankId: 'gold_2' }));
    expect(rpc).toHaveBeenCalledWith('go_school_tsumego_start', { p_rank_id: 'silver_4' });
  });

  it('結果は正解/不正解だけを送り、格はサーバーの計算を受け取る', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: serverRow({ points: 1, total_solved: 1, total_attempts: 1 }), error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);

    await expect(recordTsumegoResultOnServer(true)).resolves.toEqual(expect.objectContaining({ points: 1 }));
    expect(rpc).toHaveBeenCalledWith('go_school_tsumego_record', { p_is_correct: true });
  });

  it('結果は解いた順に送る（前が失敗しても次を送る）', async () => {
    const order: boolean[] = [];
    let first = true;
    const rpc = vi.fn(async (_fn: string, args: { p_is_correct: boolean }) => {
      order.push(args.p_is_correct);
      if (first) { first = false; return { data: null, error: new Error('network') }; }
      return { data: serverRow(), error: null };
    });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);

    const a = recordTsumegoResultOnServer(false);
    const b = recordTsumegoResultOnServer(true);
    await expect(a).rejects.toThrow('network');
    await expect(b).resolves.toBeTruthy();
    expect(order).toEqual([false, true]);
  });

  it('講師は生徒の格付けを消せる', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never);
    await resetTsumegoRatingOnServer('1001');
    expect(rpc).toHaveBeenCalledWith('go_school_tsumego_reset', { p_login_id: '1001' });
  });
});
