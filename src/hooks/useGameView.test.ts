import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameView } from './useGameView';
import { createEmptyBoard } from '../utils/gameLogic';
import type { GameSession } from '../types/game';

function createMockGame(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 'game-1',
    blackPlayer: 'たろう',
    whitePlayer: 'はなこ',
    boardSize: 9,
    handicap: 0,
    komi: 6.5,
    status: 'playing',
    boardState: createEmptyBoard(9),
    currentColor: 'BLACK',
    moveNumber: 0,
    moveHistory: [],
    blackCaptures: 0,
    whiteCaptures: 0,
    ...overrides,
  };
}

describe('useGameView', () => {
  // === GAME_CREATED ===
  describe('GAME_CREATED', () => {
    it('対局が追加される', () => {
      const { result } = renderHook(() => useGameView());
      const game = createMockGame();

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game },
        });
      });

      expect(result.current.games).toHaveLength(1);
      expect(result.current.games[0].id).toBe('game-1');
    });

    it('複数対局を受信できる', () => {
      const { result } = renderHook(() => useGameView());

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game: createMockGame({ id: 'game-1' }) },
        });
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game: createMockGame({ id: 'game-2', blackPlayer: 'じろう' }) },
        });
      });

      expect(result.current.games).toHaveLength(2);
    });
  });

  // === GAME_BOARD_UPDATE ===
  describe('GAME_BOARD_UPDATE', () => {
    it('盤面が更新される', () => {
      const { result } = renderHook(() => useGameView());
      const game = createMockGame();

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game },
        });
      });

      const newBoard = createEmptyBoard(9);
      newBoard[2][2] = { color: 'BLACK', number: 1 };

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_BOARD_UPDATE',
          payload: {
            gameId: 'game-1',
            boardState: newBoard,
            currentColor: 'WHITE',
            moveNumber: 1,
            blackCaptures: 0,
            whiteCaptures: 0,
          },
        });
      });

      const updated = result.current.games[0];
      expect(updated.boardState[2][2]?.color).toBe('BLACK');
      expect(updated.currentColor).toBe('WHITE');
      expect(updated.moveNumber).toBe(1);
    });

    it('存在しない対局IDの更新は無視', () => {
      const { result } = renderHook(() => useGameView());

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game: createMockGame() },
        });
      });

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_BOARD_UPDATE',
          payload: {
            gameId: 'nonexistent',
            boardState: createEmptyBoard(9),
            currentColor: 'WHITE',
            moveNumber: 1,
            blackCaptures: 0,
            whiteCaptures: 0,
          },
        });
      });

      // game-1は変わらない
      expect(result.current.games[0].moveNumber).toBe(0);
    });
  });

  // === GAME_ENDED ===
  describe('GAME_ENDED', () => {
    it('対局が終局になる', () => {
      const { result } = renderHook(() => useGameView());

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game: createMockGame() },
        });
      });

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_ENDED',
          payload: { gameId: 'game-1', result: 'B+R' },
        });
      });

      expect(result.current.games[0].status).toBe('finished');
      expect(result.current.games[0].result).toBe('B+R');
    });
  });

  // === GAME_LIST_SYNC ===
  describe('GAME_LIST_SYNC', () => {
    it('対局一覧が丸ごと置き換わる', () => {
      const { result } = renderHook(() => useGameView());

      // 最初に1つ追加
      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game: createMockGame({ id: 'old-game' }) },
        });
      });
      expect(result.current.games).toHaveLength(1);

      // 同期で3つに置き換え
      const syncGames = [
        createMockGame({ id: 'sync-1' }),
        createMockGame({ id: 'sync-2' }),
        createMockGame({ id: 'sync-3' }),
      ];

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_LIST_SYNC',
          payload: { games: syncGames },
        });
      });

      expect(result.current.games).toHaveLength(3);
      expect(result.current.games.map(g => g.id)).toEqual(['sync-1', 'sync-2', 'sync-3']);
    });
  });

  // === getMyGame ===
  describe('getMyGame', () => {
    it('自分が黒番の進行中対局を返す', () => {
      const { result } = renderHook(() => useGameView());

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game: createMockGame({ blackPlayer: 'たろう' }) },
        });
      });

      expect(result.current.getMyGame('たろう')?.id).toBe('game-1');
    });

    it('自分が白番の進行中対局を返す', () => {
      const { result } = renderHook(() => useGameView());

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game: createMockGame({ whitePlayer: 'たろう' }) },
        });
      });

      expect(result.current.getMyGame('たろう')?.id).toBe('game-1');
    });

    it('終局済みの対局は返さない', () => {
      const { result } = renderHook(() => useGameView());

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game: createMockGame({ status: 'finished' }) },
        });
      });

      expect(result.current.getMyGame('たろう')).toBeUndefined();
    });

    it('参加していない対局は返さない', () => {
      const { result } = renderHook(() => useGameView());

      act(() => {
        result.current.handleGameMessage({
          type: 'GAME_CREATED',
          payload: { game: createMockGame() },
        });
      });

      expect(result.current.getMyGame('観戦者')).toBeUndefined();
    });
  });

  // === activeGameId ===
  describe('activeGameId', () => {
    it('初期値はnull', () => {
      const { result } = renderHook(() => useGameView());
      expect(result.current.activeGameId).toBeNull();
    });

    it('setActiveGameIdで変更できる', () => {
      const { result } = renderHook(() => useGameView());

      act(() => {
        result.current.setActiveGameId('game-1');
      });

      expect(result.current.activeGameId).toBe('game-1');
    });
  });
});
