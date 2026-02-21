import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameManager } from './useGameManager';
import type { ClassroomLiveKit } from '../utils/classroomLiveKit';

// モックclassroomRef
function createMockClassroom() {
  const mock = {
    broadcast: vi.fn(),
    sendTo: vi.fn(),
  } as unknown as ClassroomLiveKit;
  const ref = { current: mock };
  return { mock, ref };
}

const baseOpts = {
  blackPlayer: 'たろう',
  whitePlayer: 'はなこ',
  boardSize: 9,
  handicap: 0,
  komi: 6.5,
};

describe('useGameManager', () => {
  let classroom: ReturnType<typeof createMockClassroom>;

  beforeEach(() => {
    classroom = createMockClassroom();
    vi.clearAllMocks();
  });

  // === 対局作成 ===
  describe('createGame', () => {
    it('対局を作成し一覧に追加される', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));
      let game: ReturnType<typeof result.current.createGame>;

      act(() => {
        game = result.current.createGame(baseOpts);
      });

      expect(result.current.games).toHaveLength(1);
      expect(result.current.games[0].blackPlayer).toBe('たろう');
      expect(result.current.games[0].whitePlayer).toBe('はなこ');
      expect(result.current.games[0].boardSize).toBe(9);
      expect(result.current.games[0].status).toBe('playing');
      expect(result.current.games[0].currentColor).toBe('BLACK');
      expect(result.current.games[0].moveNumber).toBe(0);
    });

    it('置石2子で白番スタート', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame({ ...baseOpts, handicap: 2 });
      });

      const game = result.current.games[0];
      expect(game.currentColor).toBe('WHITE');
      // 9路2子置石: 右上と左下に黒石
      const stones = game.boardState.flatMap((row, y) =>
        row.map((cell, x) => cell ? { x: x + 1, y: y + 1, color: cell.color } : null).filter(Boolean)
      );
      expect(stones).toHaveLength(2);
      stones.forEach(s => expect(s!.color).toBe('BLACK'));
    });

    it('GAME_CREATEDをbroadcastする', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });

      expect(classroom.mock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GAME_CREATED' })
      );
    });

    it('複数対局を作成できる', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
        result.current.createGame({ ...baseOpts, blackPlayer: 'じろう', boardSize: 13 });
      });

      expect(result.current.games).toHaveLength(2);
      expect(result.current.games[1].blackPlayer).toBe('じろう');
      expect(result.current.games[1].boardSize).toBe(13);
    });
  });

  // === 着手 ===
  describe('handleMove', () => {
    it('合法手で盤面が更新される', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleMove(gameId, 3, 3, 'BLACK');
      });

      const game = result.current.games[0];
      expect(game.boardState[2][2]?.color).toBe('BLACK');
      expect(game.currentColor).toBe('WHITE');
      expect(game.moveNumber).toBe(1);
      expect(game.moveHistory).toHaveLength(1);
    });

    it('GAME_BOARD_UPDATEをbroadcastする', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;
      vi.clearAllMocks();

      act(() => {
        result.current.handleMove(gameId, 3, 3, 'BLACK');
      });

      expect(classroom.mock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'GAME_BOARD_UPDATE',
          payload: expect.objectContaining({
            gameId,
            moveNumber: 1,
          }),
        })
      );
    });

    it('手番でない色は無視される', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleMove(gameId, 3, 3, 'WHITE'); // 黒番なのに白
      });

      expect(result.current.games[0].moveNumber).toBe(0);
    });

    it('存在しない対局IDは無視される', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });

      act(() => {
        result.current.handleMove('nonexistent', 3, 3, 'BLACK');
      });

      expect(result.current.games[0].moveNumber).toBe(0);
    });

    it('交互に着手できる', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleMove(gameId, 3, 3, 'BLACK');
      });
      act(() => {
        result.current.handleMove(gameId, 4, 4, 'WHITE');
      });

      const game = result.current.games[0];
      expect(game.moveNumber).toBe(2);
      expect(game.boardState[2][2]?.color).toBe('BLACK');
      expect(game.boardState[3][3]?.color).toBe('WHITE');
      expect(game.currentColor).toBe('BLACK');
    });
  });

  // === パス ===
  describe('handlePass', () => {
    it('パスで手番が交代する', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handlePass(gameId, 'BLACK');
      });

      const game = result.current.games[0];
      expect(game.currentColor).toBe('WHITE');
      expect(game.moveNumber).toBe(1);
      expect(game.moveHistory[0]).toEqual({ x: 0, y: 0, color: 'BLACK' });
    });

    it('連続パスで終局する', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handlePass(gameId, 'BLACK');
      });
      act(() => {
        result.current.handlePass(gameId, 'WHITE');
      });

      const game = result.current.games[0];
      expect(game.status).toBe('finished');
      expect(game.result).toBe('双方パス');
    });

    it('間に着手があれば連続パスにならない', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handlePass(gameId, 'BLACK');
      });
      act(() => {
        result.current.handleMove(gameId, 3, 3, 'WHITE');
      });
      act(() => {
        result.current.handlePass(gameId, 'BLACK');
      });

      expect(result.current.games[0].status).toBe('playing');
    });
  });

  // === 投了 ===
  describe('handleResign', () => {
    it('黒番投了で白勝ち', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleResign(gameId, 'BLACK');
      });

      expect(result.current.games[0].status).toBe('finished');
      expect(result.current.games[0].result).toBe('W+R');
    });

    it('白番投了で黒勝ち', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleMove(gameId, 3, 3, 'BLACK'); // 白番にする
      });
      act(() => {
        result.current.handleResign(gameId, 'WHITE');
      });

      expect(result.current.games[0].result).toBe('B+R');
    });

    it('GAME_ENDEDをbroadcastする', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;
      vi.clearAllMocks();

      act(() => {
        result.current.handleResign(gameId, 'BLACK');
      });

      expect(classroom.mock.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'GAME_ENDED',
          payload: { gameId, result: 'W+R' },
        })
      );
    });
  });

  // === メッセージハンドラ（生徒からの受信） ===
  describe('handleGameMessage', () => {
    it('GAME_MOVEを正しい送信者から受信→着手実行', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleGameMessage(
          { type: 'GAME_MOVE', payload: { gameId, x: 5, y: 5, color: 'BLACK' } },
          'たろう' // blackPlayer
        );
      });

      expect(result.current.games[0].moveNumber).toBe(1);
    });

    it('無関係な送信者からのGAME_MOVEは無視', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleGameMessage(
          { type: 'GAME_MOVE', payload: { gameId, x: 5, y: 5, color: 'BLACK' } },
          '観戦者'
        );
      });

      expect(result.current.games[0].moveNumber).toBe(0);
    });

    it('色が一致しないGAME_MOVEは無視', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleGameMessage(
          { type: 'GAME_MOVE', payload: { gameId, x: 5, y: 5, color: 'WHITE' } },
          'たろう' // たろうは黒番なのにWHITEを送信
        );
      });

      expect(result.current.games[0].moveNumber).toBe(0);
    });

    it('GAME_PASSを受信→パス実行', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleGameMessage(
          { type: 'GAME_PASS', payload: { gameId, color: 'BLACK' } },
          'たろう'
        );
      });

      expect(result.current.games[0].currentColor).toBe('WHITE');
    });

    it('GAME_RESIGNを受信→投了実行', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });
      const gameId = result.current.games[0].id;

      act(() => {
        result.current.handleGameMessage(
          { type: 'GAME_RESIGN', payload: { gameId, color: 'BLACK' } },
          'たろう'
        );
      });

      expect(result.current.games[0].status).toBe('finished');
      expect(result.current.games[0].result).toBe('W+R');
    });
  });

  // === 参加者同期 ===
  describe('syncGamesToParticipant', () => {
    it('特定の参加者にGAME_LIST_SYNCを送信', () => {
      const { result } = renderHook(() => useGameManager(classroom.ref));

      act(() => {
        result.current.createGame(baseOpts);
      });

      act(() => {
        result.current.syncGamesToParticipant('新参加者');
      });

      expect(classroom.mock.sendTo).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GAME_LIST_SYNC' }),
        ['新参加者']
      );
    });
  });
});
