import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Problem } from '../types/problem';
import type { TsumegoRatingState } from '../types/tsumegoRating';
import { createEmptyBoard } from '../utils/gameLogic';
import { processRatingUpdate, saveTsumegoRatingToStorage } from '../utils/tsumegoRating';
import { useTsumegoRating } from './useTsumegoRating';

const server = {
  load: vi.fn(),
  start: vi.fn(),
  record: vi.fn(),
};
vi.mock('../utils/tsumegoRatingStore', () => ({
  loadTsumegoRatingFromServer: (...a: unknown[]) => server.load(...a),
  startTsumegoRatingOnServer: (...a: unknown[]) => server.start(...a),
  recordTsumegoResultOnServer: (...a: unknown[]) => server.record(...a),
}));
const fetchRandom = vi.fn();
vi.mock('../utils/tsumegoApi', () => ({
  fetchRandomTsumegoProblem: (...a: unknown[]) => fetchRandom(...a),
}));
vi.mock('../utils/tsumegoConvert', () => ({
  tsumegoRowToProblem: (row: { id: string }) => problem(row.id),
}));

function problem(id: string): Problem {
  return {
    id, title: id, boardSize: 19, initialBoard: createEmptyBoard(19), correctColor: 'BLACK',
    sgfTree: { children: [] }, difficulty: '5K', createdAt: '',
  };
}

function state(rankId: string, points = 0): TsumegoRatingState {
  return {
    rankId, points, consecutiveWins: 0, protectionCount: 0, totalSolved: 0, totalAttempts: 0,
    highestRankId: rankId, lastUpdated: '2026-09-27T00:00:00.000Z',
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const base = { ...problem('assign'), ratingMode: true, lives: 2 };

beforeEach(() => {
  localStorage.clear();
  server.load.mockReset();
  server.start.mockReset();
  server.record.mockReset();
  fetchRandom.mockReset();
  fetchRandom.mockImplementation(async ({ level }: { level: string }) => ({ id: `p-${level}` }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('useTsumegoRating', () => {
  it('入室後に格が上がったら、次の出題は新しい格の難易度で選ぶ（古い格を掴まない）', async () => {
    server.load.mockResolvedValue(state('bronze_4', 4));
    server.record.mockResolvedValue(state('bronze_3'));
    const onProblemReady = vi.fn();
    const { result } = renderHook(() => useTsumegoRating({ enabled: true, studentId: 's1', userName: 'A', onProblemReady }));
    // 接続時に作ったハンドラが持つのと同じ参照
    const handler = result.current.handleIncomingRatingProblem;
    await waitFor(() => expect(result.current.rating?.rankId).toBe('bronze_4'));

    // 正解して昇格（bronze_4 → bronze_3 = 13級）
    act(() => result.current.handleRatingUpdate(processRatingUpdate(result.current.rating!, true)));
    await waitFor(() => expect(result.current.rating?.rankId).toBe('bronze_3'));

    expect(result.current.handleIncomingRatingProblem).toBe(handler);
    await act(async () => { await handler(base); });
    expect(fetchRandom).toHaveBeenLastCalledWith({ level: '13K', boardSize: 19 });
    expect(onProblemReady).toHaveBeenLastCalledWith(expect.objectContaining({ ratingMode: true, lives: 2 }));
  });

  it('アカウントの格を読み終わる前に出題が届いても、初期格の選択を出さずに読み込みを待つ', async () => {
    const load = deferred<TsumegoRatingState | null>();
    server.load.mockReturnValue(load.promise);
    const onProblemReady = vi.fn();
    const { result } = renderHook(() => useTsumegoRating({ enabled: true, studentId: 's1', userName: 'A', onProblemReady }));

    let done!: Promise<void>;
    act(() => { done = result.current.handleIncomingRatingProblem(base); });
    expect(result.current.showInitialRankDialog).toBe(false);

    await act(async () => { load.resolve(state('gold_4')); await done; });
    expect(result.current.showInitialRankDialog).toBe(false);
    expect(fetchRandom).toHaveBeenLastCalledWith({ level: '4K', boardSize: 19 });
  });

  it('アカウントを読めないときは初期格の選択を出さず、エラーにする', async () => {
    server.load.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTsumegoRating({ enabled: true, studentId: 's1', userName: 'A', onProblemReady: vi.fn() }));
    await act(async () => { await result.current.handleIncomingRatingProblem(base); });
    expect(result.current.showInitialRankDialog).toBe(false);
    expect(result.current.startError).toMatch(/格付けを読み込めませんでした/);
    // 読み直す（初回の失敗のあと、出題時にもう一度）
    expect(server.load).toHaveBeenCalledTimes(2);
  });

  it('アカウントに格が無いときだけ初期格を選ばせ、選んだ格はサーバーで決める', async () => {
    server.load.mockResolvedValue(null);
    // 別の端末で先に決めていた格が返る
    server.start.mockResolvedValue(state('silver_2'));
    const { result } = renderHook(() => useTsumegoRating({ enabled: true, studentId: 's1', userName: 'A', onProblemReady: vi.fn() }));
    await act(async () => { await result.current.handleIncomingRatingProblem(base); });
    expect(result.current.showInitialRankDialog).toBe(true);

    await act(async () => { await result.current.selectInitialRank('stone_4'); });
    expect(server.start).toHaveBeenCalledWith('stone_4');
    expect(result.current.rating?.rankId).toBe('silver_2');
  });

  it('送信中の結果が残っている間は、サーバーの返事で表示を巻き戻さない', async () => {
    server.load.mockResolvedValue(state('bronze_4', 0));
    const first = deferred<TsumegoRatingState>();
    const second = deferred<TsumegoRatingState>();
    server.record.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useTsumegoRating({ enabled: true, studentId: 's1', userName: 'A', onProblemReady: vi.fn() }));
    await waitFor(() => expect(result.current.rating).not.toBeNull());

    act(() => result.current.handleRatingUpdate(processRatingUpdate(result.current.rating!, true)));
    act(() => result.current.handleRatingUpdate(processRatingUpdate(result.current.rating!, true)));
    expect(result.current.rating?.points).toBe(2);

    await act(async () => { first.resolve(state('bronze_4', 1)); await first.promise; });
    expect(result.current.rating?.points).toBe(2);
    await act(async () => { second.resolve(state('bronze_4', 2)); await second.promise; });
    expect(result.current.rating?.points).toBe(2);
    expect(server.record).toHaveBeenNthCalledWith(1, true);
  });

  it('端末キャッシュは生徒IDの鍵だけを使う（ID が分かる前の名前の鍵は読まない）', () => {
    saveTsumegoRatingToStorage(state('gold_4'), 's1');
    saveTsumegoRatingToStorage(state('stone_4'), '1001');
    server.load.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useTsumegoRating({ enabled: true, studentId: 's1', userName: 'A', onProblemReady: vi.fn() }));
    expect(result.current.rating?.rankId).toBe('gold_4');
  });
});
