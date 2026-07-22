import { describe, it, expect, beforeEach, vi } from 'vitest';
import { reportTsumegoProblem } from './tsumegoApi';

const mockGetUser = vi.fn(() => Promise.resolve({ data: { user: { id: 'user-123' } } }));
const mockInsert = vi.fn(() => Promise.resolve({ error: null }));
const mockFrom = vi.fn(() => ({ insert: mockInsert }));

vi.mock('./liveGameApi', () => ({
  getSupabase: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));

describe('reportTsumegoProblem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } } });
    mockInsert.mockResolvedValue({ error: null });
  });

  it('tsumego_reportsへ問題ID・source_id・報告者ID・理由をINSERTする', async () => {
    await reportTsumegoProblem({ problemId: 'p-1', sourceId: 52626, reason: '正解手順が成立しない' });
    expect(mockFrom).toHaveBeenCalledWith('tsumego_reports');
    expect(mockInsert).toHaveBeenCalledWith({
      problem_id: 'p-1',
      source_id: 52626,
      reporter_id: 'user-123',
      reason: '正解手順が成立しない',
    });
  });

  it('理由が空文字の場合はnullで送る', async () => {
    await reportTsumegoProblem({ problemId: 'p-1', sourceId: 52626, reason: '   ' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ reason: null }));
  });

  it('未ログイン(匿名認証なし)でもreporter_idをnullで送る', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } } as never);
    await reportTsumegoProblem({ problemId: 'p-1', sourceId: 52626, reason: '' });
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ reporter_id: null }));
  });

  it('INSERTが失敗したら例外を投げる', async () => {
    mockInsert.mockResolvedValueOnce({ error: { message: 'boom' } } as never);
    await expect(reportTsumegoProblem({ problemId: 'p-1', sourceId: 1, reason: '' })).rejects.toBeTruthy();
  });
});
