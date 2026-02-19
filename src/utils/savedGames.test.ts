import { describe, it, expect, beforeEach } from 'vitest';
import { loadSavedGames, saveGame, deleteGame, getGame } from './savedGames';
import type { SavedGame } from '../types/game';

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
});
