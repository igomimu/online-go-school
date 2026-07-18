import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSavedGames, saveGame, deleteGame, getGame, loadSavedGamesForStudent } from './savedGames';
import type { SavedGame } from '../types/game';

const mockOrder = vi.fn(() => Promise.resolve({ data: [], error: null }));
const mockOr = vi.fn(() => ({ order: mockOrder }));
const mockSelect = vi.fn(() => ({ or: mockOr }));
const mockUpsert = vi.fn(() => Promise.resolve({ error: null }));
const mockDeleteEq = vi.fn(() => Promise.resolve({ error: null }));
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq }));
const mockFrom = vi.fn(() => ({
  select: mockSelect,
  upsert: mockUpsert,
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
