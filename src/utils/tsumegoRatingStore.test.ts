import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabase } from './liveGameApi';
import { createInitialRatingState } from './tsumegoRating';
import { loadTsumegoRatingFromServer, saveTsumegoRatingToServer } from './tsumegoRatingStore';

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

  it('格付け状態を生徒ログインID付きでupsertする', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getSupabase).mockReturnValue({ from: () => ({ upsert }) } as never);
    const state = createInitialRatingState('silver_4');

    await saveTsumegoRatingToServer(state, '1001');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ student_login_id: '1001', rank_id: 'silver_4' }),
      { onConflict: 'student_login_id' },
    );
  });
});
