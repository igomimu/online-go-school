import { useState, useCallback, useRef } from 'react';
import type { GameSession, GameMove, GameMovePayload, GameBoardUpdatePayload, GameClock } from '../types/game';
import type { ClassroomLiveKit, ClassroomMessage } from '../utils/classroomLiveKit';
import type { StoneColor } from '../components/GoBoard';
import { createEmptyBoard, checkCapture, isLegalMove, boardHash } from '../utils/gameLogic';
import { getHandicapStones } from '../utils/handicapStones';
import { exportGameToSgf, todaySgfDate } from '../utils/sgfExport';
import { saveGame } from '../utils/savedGames';
import { switchClock, useGameClockTick } from './useGameClock';
import { calculateTerritory, formatScoringResult } from '../utils/scoring';

// --- 進行中の対局をlocalStorageに永続化 ---
const ACTIVE_GAMES_KEY = 'go-school-active-games';

function persistActiveGames(games: GameSession[]): void {
  try {
    // playing/scoring状態の対局のみ保存（finishedはSupabaseに保存済み）
    const active = games.filter(g => g.status !== 'finished');
    localStorage.setItem(ACTIVE_GAMES_KEY, JSON.stringify(active));
  } catch { /* localStorage full — ignore */ }
}

function restoreActiveGames(): GameSession[] {
  try {
    const data = localStorage.getItem(ACTIVE_GAMES_KEY);
    if (!data) return [];
    const games = JSON.parse(data) as GameSession[];
    // 時計を一時停止状態で復元（再接続後に再開）
    return games.map(g => ({
      ...g,
      clock: g.clock ? { ...g.clock, lastTickTime: null } : undefined,
    }));
  } catch {
    return [];
  }
}

// 先生用：対局管理ロジック
export function useGameManager(classroomRef: React.RefObject<ClassroomLiveKit | null>) {
  const [games, setGames] = useState<GameSession[]>(() => restoreActiveGames());
  const gamesRef = useRef<GameSession[]>([]);

  // gamesRefを同期 + localStorageに永続化
  const updateGames = useCallback((updater: (prev: GameSession[]) => GameSession[]) => {
    setGames(prev => {
      const next = updater(prev);
      gamesRef.current = next;
      persistActiveGames(next);
      return next;
    });
  }, []);

  // 対局終了
  const endGame = useCallback((gameId: string, result: string) => {
    const game = gamesRef.current.find(g => g.id === gameId);
    if (!game) return;

    updateGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      return { ...g, status: 'finished', result, scoringDeadStones: undefined };
    }));

    // SGF保存
    const sgf = exportGameToSgf({
      boardSize: game.boardSize,
      handicap: game.handicap,
      komi: game.komi,
      blackPlayer: game.blackPlayer,
      whitePlayer: game.whitePlayer,
      result,
      moves: game.moveHistory,
      date: todaySgfDate(),
    });

    saveGame({
      id: game.id,
      date: todaySgfDate(),
      blackPlayer: game.blackPlayer,
      whitePlayer: game.whitePlayer,
      boardSize: game.boardSize,
      handicap: game.handicap,
      komi: game.komi,
      result,
      sgf,
    });

    classroomRef.current?.broadcast({
      type: 'GAME_ENDED',
      payload: { gameId, result },
    });
  }, [classroomRef, updateGames]);

  // 対局作成
  const createGame = useCallback((opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
    clock?: GameClock;
  }) => {
    const { blackPlayer, whitePlayer, boardSize, handicap, komi, clock } = opts;

    let initialBoard = createEmptyBoard(boardSize);

    // 置石配置
    if (handicap >= 2) {
      const stones = getHandicapStones(boardSize, handicap);
      stones.forEach(s => {
        initialBoard[s.y - 1][s.x - 1] = { color: 'BLACK' };
      });
    }

    const game: GameSession = {
      id: crypto.randomUUID(),
      blackPlayer,
      whitePlayer,
      boardSize,
      handicap,
      komi,
      status: 'playing',
      boardState: initialBoard,
      currentColor: handicap >= 2 ? 'WHITE' : 'BLACK',
      moveNumber: 0,
      moveHistory: [],
      blackCaptures: 0,
      whiteCaptures: 0,
      clock: clock ? { ...clock, lastTickTime: Date.now() } : undefined,
    };

    updateGames(prev => [...prev, game]);

    // 全員に通知
    classroomRef.current?.broadcast({
      type: 'GAME_CREATED',
      payload: { game },
    });

    return game;
  }, [classroomRef, updateGames]);

  // 着手処理（先生がバリデーション）
  const handleMove = useCallback((gameId: string, x: number, y: number, color: StoneColor) => {
    const game = gamesRef.current.find(g => g.id === gameId);
    if (!game || game.status !== 'playing') return;
    if (game.currentColor !== color) return;

    if (!isLegalMove(game.boardState, x, y, color, game.boardSize, game.lastBoardHash)) {
      return;
    }

    // 着手実行
    const newBoard = game.boardState.map(row => row.map(cell => cell ? { ...cell } : null));
    newBoard[y - 1][x - 1] = { color, number: game.moveNumber + 1 };

    const { board: capturedBoard, capturedCount } = checkCapture(newBoard, x, y, color, game.boardSize);

    const prevHash = boardHash(game.boardState);
    const move: GameMove = { x, y, color };

    updateGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      return {
        ...g,
        boardState: capturedBoard,
        currentColor: color === 'BLACK' ? 'WHITE' : 'BLACK',
        moveNumber: g.moveNumber + 1,
        moveHistory: [...g.moveHistory, move],
        blackCaptures: g.blackCaptures + (color === 'BLACK' ? capturedCount : 0),
        whiteCaptures: g.whiteCaptures + (color === 'WHITE' ? capturedCount : 0),
        lastBoardHash: prevHash,
        clock: g.clock ? switchClock(g.clock, color) : undefined,
      };
    }));

    // 全員に盤面更新通知
    const updatePayload: GameBoardUpdatePayload = {
      gameId,
      boardState: capturedBoard,
      currentColor: color === 'BLACK' ? 'WHITE' : 'BLACK',
      moveNumber: game.moveNumber + 1,
      blackCaptures: game.blackCaptures + (color === 'BLACK' ? capturedCount : 0),
      whiteCaptures: game.whiteCaptures + (color === 'WHITE' ? capturedCount : 0),
      lastMove: move,
    };

    classroomRef.current?.broadcast({
      type: 'GAME_BOARD_UPDATE',
      payload: updatePayload,
    });
  }, [classroomRef, updateGames]);

  // 整地モード開始
  const enterScoring = useCallback((gameId: string) => {
    updateGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      return {
        ...g,
        status: 'scoring' as const,
        scoringDeadStones: [],
        clock: g.clock ? { ...g.clock, lastTickTime: null } : undefined, // 時計停止
      };
    }));

    classroomRef.current?.broadcast({
      type: 'SCORING_UPDATE',
      payload: { gameId, deadStones: [], status: 'scoring' },
    });
  }, [classroomRef, updateGames]);

  // 死石トグル
  const toggleDeadStone = useCallback((gameId: string, x: number, y: number) => {
    const game = gamesRef.current.find(g => g.id === gameId);
    if (!game || game.status !== 'scoring') return;

    // Only toggle if there's a stone at this position
    const stone = game.boardState[y - 1]?.[x - 1];
    if (!stone) return;

    const key = `${x},${y}`;
    const currentDead = new Set(game.scoringDeadStones || []);

    // Find the group containing this stone and toggle the entire group
    const group = findGroup(game.boardState, x - 1, y - 1, stone.color, game.boardSize);

    const isCurrentlyDead = currentDead.has(key);
    for (const pos of group) {
      const groupKey = `${pos.x + 1},${pos.y + 1}`;
      if (isCurrentlyDead) {
        currentDead.delete(groupKey);
      } else {
        currentDead.add(groupKey);
      }
    }

    const newDeadStones = Array.from(currentDead);

    updateGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      return { ...g, scoringDeadStones: newDeadStones };
    }));

    classroomRef.current?.broadcast({
      type: 'SCORING_UPDATE',
      payload: { gameId, deadStones: newDeadStones, status: 'scoring' },
    });
  }, [classroomRef, updateGames]);

  // 整地確定
  const confirmScoring = useCallback((gameId: string) => {
    const game = gamesRef.current.find(g => g.id === gameId);
    if (!game || game.status !== 'scoring') return;

    const deadSet = new Set(game.scoringDeadStones || []);
    const result = calculateTerritory(
      game.boardState, game.boardSize, deadSet,
      game.blackCaptures, game.whiteCaptures, game.komi,
    );
    const resultStr = formatScoringResult(result);
    endGame(gameId, resultStr);
  }, [endGame]);

  // パス処理
  const handlePass = useCallback((gameId: string, color: StoneColor) => {
    const game = gamesRef.current.find(g => g.id === gameId);
    if (!game || game.status !== 'playing') return;
    if (game.currentColor !== color) return;

    const passMove: GameMove = { x: 0, y: 0, color };

    // 連続パスで整地モードへ
    const lastMove = game.moveHistory[game.moveHistory.length - 1];
    const isDoublePass = lastMove && lastMove.x === 0 && lastMove.y === 0;

    if (isDoublePass) {
      // パスの手を記録してから整地モードへ
      updateGames(prev => prev.map(g => {
        if (g.id !== gameId) return g;
        return {
          ...g,
          moveHistory: [...g.moveHistory, passMove],
        };
      }));
      enterScoring(gameId);
      return;
    }

    updateGames(prev => prev.map(g => {
      if (g.id !== gameId) return g;
      return {
        ...g,
        currentColor: color === 'BLACK' ? 'WHITE' : 'BLACK',
        moveNumber: g.moveNumber + 1,
        moveHistory: [...g.moveHistory, passMove],
      };
    }));

    classroomRef.current?.broadcast({
      type: 'GAME_BOARD_UPDATE',
      payload: {
        gameId,
        boardState: game.boardState,
        currentColor: color === 'BLACK' ? 'WHITE' : 'BLACK',
        moveNumber: game.moveNumber + 1,
        blackCaptures: game.blackCaptures,
        whiteCaptures: game.whiteCaptures,
        lastMove: passMove,
      } as GameBoardUpdatePayload,
    });
  }, [classroomRef, updateGames, enterScoring]);

  // 投了処理
  const handleResign = useCallback((gameId: string, color: StoneColor) => {
    const winner = color === 'BLACK' ? 'W' : 'B';
    endGame(gameId, `${winner}+R`);
  }, [endGame]);

  // メッセージハンドラ（生徒からの着手を受信）
  const handleGameMessage = useCallback((msg: ClassroomMessage, sender?: string) => {
    if (msg.type === 'GAME_MOVE' && sender) {
      const p = msg.payload as GameMovePayload;
      // 送信者が対局参加者か確認
      const game = gamesRef.current.find(g => g.id === p.gameId);
      if (!game) return;

      const isBlack = game.blackPlayer === sender;
      const isWhite = game.whitePlayer === sender;
      if (!isBlack && !isWhite) return;

      const expectedColor = isBlack ? 'BLACK' : 'WHITE';
      if (expectedColor !== p.color) return;

      handleMove(p.gameId, p.x, p.y, p.color);
    } else if (msg.type === 'GAME_PASS' && sender) {
      const p = msg.payload as { gameId: string; color: StoneColor };
      handlePass(p.gameId, p.color);
    } else if (msg.type === 'GAME_RESIGN' && sender) {
      const p = msg.payload as { gameId: string; color: StoneColor };
      handleResign(p.gameId, p.color);
    }
  }, [handleMove, handlePass, handleResign]);

  // 新規参加者に全対局一覧を送信
  const syncGamesToParticipant = useCallback((identity: string) => {
    classroomRef.current?.sendTo({
      type: 'GAME_LIST_SYNC',
      payload: { games: gamesRef.current },
    }, [identity]);
  }, [classroomRef]);

  // 時計更新
  const updateGameClock = useCallback((gameId: string, clock: GameClock) => {
    updateGames(prev => prev.map(g =>
      g.id === gameId ? { ...g, clock } : g
    ));
  }, [updateGames]);

  // 時間切れ
  const handleTimeUp = useCallback((gameId: string, color: 'BLACK' | 'WHITE') => {
    const winner = color === 'BLACK' ? 'W' : 'B';
    endGame(gameId, `${winner}+T`);
  }, [endGame]);

  // 残り10秒警告コールバック（外部から設定可能）
  const timeWarningRef = useRef<((gameId: string, color: 'BLACK' | 'WHITE', seconds: number) => void) | null>(null);

  const handleTimeWarning = useCallback((gameId: string, color: 'BLACK' | 'WHITE', seconds: number) => {
    timeWarningRef.current?.(gameId, color, seconds);
  }, []);

  // 1秒ごとの時計tick
  useGameClockTick(games, updateGameClock, handleTimeUp, handleTimeWarning);

  // 切断時に対局中の時計を停止
  const pauseClockForPlayer = useCallback((identity: string) => {
    updateGames(prev => prev.map(g => {
      if (g.status !== 'playing' || !g.clock || g.clock.lastTickTime === null) return g;
      if (g.blackPlayer !== identity && g.whitePlayer !== identity) return g;
      return { ...g, clock: { ...g.clock, lastTickTime: null } };
    }));
  }, [updateGames]);

  // 再接続時に時計を再開
  const resumeClockForPlayer = useCallback((identity: string) => {
    const now = Date.now();
    updateGames(prev => prev.map(g => {
      if (g.status !== 'playing' || !g.clock) return g;
      if (g.blackPlayer !== identity && g.whitePlayer !== identity) return g;
      if (g.clock.lastTickTime !== null) return g; // 既に動いている
      return { ...g, clock: { ...g.clock, lastTickTime: now } };
    }));
  }, [updateGames]);

  return {
    games,
    createGame,
    handleMove,
    handlePass,
    handleResign,
    endGame,
    handleGameMessage,
    syncGamesToParticipant,
    toggleDeadStone,
    confirmScoring,
    pauseClockForPlayer,
    resumeClockForPlayer,
    onTimeWarning: (cb: (gameId: string, color: 'BLACK' | 'WHITE', seconds: number) => void) => {
      timeWarningRef.current = cb;
    },
  };
}

/**
 * Find all stones in a connected group (same color)
 * Returns array of {x, y} positions (0-indexed)
 */
function findGroup(
  board: import('../components/GoBoard').BoardState,
  startX: number,
  startY: number,
  color: StoneColor,
  boardSize: number,
): { x: number; y: number }[] {
  const visited = new Set<string>();
  const group: { x: number; y: number }[] = [];
  const stack = [{ x: startX, y: startY }];
  visited.add(`${startX},${startY}`);

  while (stack.length > 0) {
    const { x, y } = stack.pop()!;
    group.push({ x, y });

    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= boardSize || ny < 0 || ny >= boardSize) continue;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;

      const stone = board[ny][nx];
      if (stone && stone.color === color) {
        visited.add(key);
        stack.push({ x: nx, y: ny });
      }
    }
  }

  return group;
}
