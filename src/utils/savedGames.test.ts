import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSavedGames, saveGame, deleteGame, getGame, loadSavedGamesForStudent, insertGameRecord, deleteGameRecord } from './savedGames';
import type { SavedGame } from '../types/game';

const mockOrder = vi.fn(() => Promise.resolve({ data: [], error: null }));
const mockOr = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ or: mockOr }));
const mockUpsert = vi.fn(() => Promise.resolve({ error: null }));
let insertResult: { error: { message: string } | null } = { error: null };
const mockInsert = vi.fn(() => Promise.resolve(insertResult));
const mockDeleteEq = vi.fn(() => Promise.resolve({ error: null }));
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq }));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  upsert: mockUpsert,
  insert: mockInsert,
  delete: mockDelete,
}));

vi.mock('./liveGameApi', () => ({
  getSupabase: () => ({ from: mockFrom }),
}));

const mockGame: SavedGame = {
  id: 'test-1',
  date: '2026-02-20',
  blackPlayer: 'たろう',
  whitePlayer: 'はなこ',
  boardSize: 19,
  handicap: 0,
  komi: 6.5,
  result: 'B+R',
  sgf: '(;GM[1]SZ[19];B[pd];W[dd])',
};

describe('savedGames (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('初期状態は空配列', () => {
    expect(loadSavedGames()).toEqual([]);
  });

  it('棋譜を保存して読み込む', () => {
    saveGame(mockGame);
    const games = loadSavedGames();
    expect(games.length).toBe(1);
    expect(games[0].id).toBe('test-1');
    expect(games[0].blackPlayer).toBe('たろう');
  });

  it('同じIDの保存は重複せず置き換える', () => {
    saveGame(mockGame);
    saveGame({ ...mockGame, result: 'W+R' });
    const games = loadSavedGames();
    expect(games).toHaveLength(1);
    expect(games[0].result).toBe('W+R');
  });

  it('最新の棋譜が先頭に来る', () => {
    saveGame(mockGame);
    saveGame({ ...mockGame, id: 'test-2', blackPlayer: 'じろう' });
    const games = loadSavedGames();
    expect(games[0].id).toBe('test-2');
    expect(games[1].id).toBe('test-1');
  });

  it('棋譜を削除する', () => {
    saveGame(mockGame);
    saveGame({ ...mockGame, id: 'test-2' });
    deleteGame('test-1');
    const games = loadSavedGames();
    expect(games.length).toBe(1);
    expect(games[0].id).toBe('test-2');
  });

  it('IDで棋譜を取得する', () => {
    saveGame(mockGame);
    const game = getGame('test-1');
    expect(game?.blackPlayer).toBe('たろう');
  });

  it('存在しないIDはundefined', () => {
    expect(getGame('xxx')).toBeUndefined();
  });

  it('壊れたJSONでも空配列を返す', () => {
    localStorage.setItem('go-school-saved-games', '{broken');
    expect(loadSavedGames()).toEqual([]);
  });

  it('生徒別履歴検索では生徒名ではなく bare ID と sid: ID の両方を検索する', async () => {
    await loadSavedGamesForStudent('たろう', 'student-uuid');

    expect(mockFrom).toHaveBeenCalledWith('go_school_games');
    expect(mockOr).toHaveBeenCalledWith(
      'black_player.eq."student-uuid",white_player.eq."student-uuid",black_player.eq."sid:student-uuid",white_player.eq."sid:student-uuid"',
    );
  });

  it('同姓同名でも別IDの棋譜は検索条件に混ぜない', async () => {
    await loadSavedGamesForStudent('同じ名前', '1002');
    expect(mockOr).toHaveBeenLastCalledWith(
      'black_player.eq."1002",white_player.eq."1002",black_player.eq."sid:1002",white_player.eq."sid:1002"',
    );

    await loadSavedGamesForStudent('同じ名前', '1003');
    expect(mockOr).toHaveBeenLastCalledWith(
      'black_player.eq."1003",white_player.eq."1003",black_player.eq."sid:1003",white_player.eq."sid:1003"',
    );
  });

  it('IDが不明な旧データ検索時だけ名前をフォールバックに使う', async () => {
    await loadSavedGamesForStudent('たろう');

    expect(mockOr).toHaveBeenCalledWith(
      'black_player.eq."たろう",white_player.eq."たろう"',
    );
  });
});

describe('持ち込んだ棋譜（棋譜作成）', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    insertResult = { error: null };
  });

  it('source と created_by を付けて insert する（upsert は使わない）', async () => {
    const res = await insertGameRecord(mockGame, { source: 'upload', createdBy: 'sid:1010' });

    expect(res.error).toBeUndefined();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 'test-1',
      black_player: 'たろう',
      source: 'upload',
      created_by: 'sid:1010',
    }));
  });

  it('保存できたときだけ手元の控えにも足す', async () => {
    await insertGameRecord(mockGame, { source: 'manual', createdBy: 'sid:1010' });
    expect(loadSavedGames()).toHaveLength(1);
    expect(loadSavedGames()[0].source).toBe('manual');
  });

  it('失敗したら文言を返し、手元にも残さない', async () => {
    insertResult = { error: { message: 'new row violates row-level security policy' } };

    const res = await insertGameRecord(mockGame, { source: 'upload', createdBy: 'sid:9999' });

    expect(res.error).toContain('row-level security');
    expect(loadSavedGames()).toHaveLength(0);
  });

  it('持込棋譜を消すと手元の控えからも消える', async () => {
    await insertGameRecord(mockGame, { source: 'upload', createdBy: 'sid:1010' });

    const res = await deleteGameRecord('test-1');

    expect(res.error).toBeUndefined();
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'test-1');
    expect(loadSavedGames()).toHaveLength(0);
  });
});
