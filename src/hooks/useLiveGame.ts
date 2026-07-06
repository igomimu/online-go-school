import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StoneColor, BoardState } from '../components/GoBoard';
import { createEmptyBoard, checkCapture } from '../utils/gameLogic';
import { getHandicapStones } from '../utils/handicapStones';
import { studentMatchesPlayer } from '../utils/identityUtils';
import { switchClock } from './useGameClock';
import type { GameClock } from '../types/game';
import {
  fetchLiveGame,
  fetchLiveMoves,
  submitMove as apiSubmitMove,
  subscribeLiveGame,
  enterScoring as apiEnterScoring,
  updateDeadStones as apiUpdateDeadStones,
  finishGame as apiFinishGame,
  resetLiveGame as apiResetLiveGame,
  type LiveGameRow,
  type LiveMoveRow,
} from '../utils/liveGameApi';
import type { ClassroomLiveKit, ClassroomMessage } from '../utils/classroomLiveKit';
import type { GameMovePayload } from '../types/game';

interface DerivedState {
  boardState: BoardState;
  currentColor: StoneColor;
  moveNumber: number;
  blackCaptures: number;
  whiteCaptures: number;
  lastMove: LiveMoveRow | null;
}

const EMPTY_MOVES: LiveMoveRow[] = [];

function deriveBoardState(game: LiveGameRow, moves: LiveMoveRow[]): DerivedState {
  let board = createEmptyBoard(game.board_size);

  // 置石を適用
  if (game.handicap >= 2) {
    const stones = getHandicapStones(game.board_size, game.handicap);
    stones.forEach((s) => {
      board[s.y - 1][s.x - 1] = { color: 'BLACK' };
    });
  }

  let blackCaptures = 0;
  let whiteCaptures = 0;

  for (const move of moves) {
    // パス (x=0, y=0) は盤面変化なし
    if (move.x === 0 && move.y === 0) continue;

    const newBoard = board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
    newBoard[move.y - 1][move.x - 1] = { color: move.color, number: move.move_number };
    const { board: afterCapture, capturedCount } = checkCapture(
      newBoard,
      move.x,
      move.y,
      move.color,
      game.board_size,
    );
    board = afterCapture;
    if (move.color === 'BLACK') blackCaptures += capturedCount;
    else whiteCaptures += capturedCount;
  }

  const lastMove = moves[moves.length - 1] ?? null;
  const moveNumber = lastMove?.move_number ?? 0;
  const currentColor: StoneColor = lastMove
    ? lastMove.color === 'BLACK'
      ? 'WHITE'
      : 'BLACK'
    : game.handicap >= 2
      ? 'WHITE'
      : 'BLACK';

  return { boardState: board, currentColor, moveNumber, blackCaptures, whiteCaptures, lastMove };
}

export interface UseLiveGameResult {
  game: LiveGameRow | null;
  boardState: BoardState;
  currentColor: StoneColor;
  moveNumber: number;
  blackCaptures: number;
  whiteCaptures: number;
  lastMove: LiveMoveRow | null;
  moves: LiveMoveRow[];

  myColor: StoneColor | null;
  isParticipant: boolean;
  isMyTurn: boolean;
  clock: GameClock | null;

  loading: boolean;
  error: string | null;

  submitMove: (x: number, y: number) => Promise<void>;
  submitPass: () => Promise<void>;
  submitResign: () => Promise<void>;
  enterScoring: () => Promise<void>;
  setDeadStones: (deadStones: string[]) => Promise<void>;
  finishWithResult: (result: string) => Promise<void>;
  resetGame: () => Promise<void>;
}

export function useLiveGame(
  gameId: string | null,
  myIdentity: string,
  isTeacher: boolean = false,
  classroom: ClassroomLiveKit | null = null,
): UseLiveGameResult {
  const [game, setGame] = useState<LiveGameRow | null>(null);
  const [moves, setMoves] = useState<LiveMoveRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof subscribeLiveGame> | null>(null);

  useEffect(() => {
    if (!gameId) {
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [g, m] = await Promise.all([fetchLiveGame(gameId), fetchLiveMoves(gameId)]);
        if (cancelled) return;
        setGame(g);
        setMoves(m);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      }
    })();

    const channel = subscribeLiveGame(gameId, {
      onGameChange: (row) => {
        setGame(row);
      },
      onMoveInsert: (row) => {
        setMoves((prev) => {
          // 重複防止（仮の着手が既に反映されている場合、本物に差し替える）
          const idx = prev.findIndex((m) => m.move_number === row.move_number);
          if (idx >= 0) {
            if (prev[idx].player_id.startsWith('temp-')) {
              const next = [...prev];
              next[idx] = row;
              return next;
            }
            return prev;
          }
          return [...prev, row].sort((a, b) => a.move_number - b.move_number);
        });
      },
    });
    channelRef.current = channel;

    return () => {
      cancelled = true;
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [gameId]);

  // LiveKitデータチャネル経由の低レイテンシ着手メッセージをリッスン
  useEffect(() => {
    if (!gameId) return;

    const handleLiveGameMessage = (e: Event) => {
      const customEvent = e as CustomEvent<{ msg: ClassroomMessage; sender?: string }>;
      const { msg, sender } = customEvent.detail;
      
      if (msg.type === 'GAME_MOVE') {
        const p = msg.payload as GameMovePayload;
        if (p.gameId !== gameId) return;
        
        setMoves((prev) => {
          const moveNum = p.moveNumber ?? (prev.length > 0 ? Math.max(...prev.map(m => m.move_number)) + 1 : 1);
          if (prev.some((m) => m.move_number === moveNum)) return prev;
          
          const tempMove: LiveMoveRow = {
            game_id: gameId,
            move_number: moveNum,
            player_id: `temp-lk-${Date.now()}-${sender || ''}`,
            x: p.x,
            y: p.y,
            color: p.color,
            created_at: new Date().toISOString(),
          };
          return [...prev, tempMove].sort((a, b) => a.move_number - b.move_number);
        });
      }
      
      if (msg.type === 'GAME_PASS') {
        const p = msg.payload as { gameId: string; color: StoneColor; moveNumber?: number };
        if (p.gameId !== gameId) return;
        
        setMoves((prev) => {
          const moveNum = p.moveNumber ?? (prev.length > 0 ? Math.max(...prev.map(m => m.move_number)) + 1 : 1);
          if (prev.some((m) => m.move_number === moveNum)) return prev;
          
          const tempMove: LiveMoveRow = {
            game_id: gameId,
            move_number: moveNum,
            player_id: `temp-lk-${Date.now()}-${sender || ''}`,
            x: 0,
            y: 0,
            color: p.color,
            created_at: new Date().toISOString(),
          };
          return [...prev, tempMove].sort((a, b) => a.move_number - b.move_number);
        });
      }
    };

    window.addEventListener('live-game-message', handleLiveGameMessage);
    return () => {
      window.removeEventListener('live-game-message', handleLiveGameMessage);
    };
  }, [gameId]);

  const activeGame = gameId ? game : null;
  const activeMoves = gameId ? moves : EMPTY_MOVES;
  const activeLoading = gameId ? loading : false;
  const activeError = gameId ? error : null;

  const derived = useMemo<DerivedState>(() => {
    if (!activeGame) {
      return {
        boardState: createEmptyBoard(19),
        currentColor: 'BLACK',
        moveNumber: 0,
        blackCaptures: 0,
        whiteCaptures: 0,
        lastMove: null,
      };
    }
    return deriveBoardState(activeGame, activeMoves);
  }, [activeGame, activeMoves]);

  const isBlack = !!activeGame && studentMatchesPlayer(myIdentity, activeGame.black_player);
  const isWhite = !!activeGame && studentMatchesPlayer(myIdentity, activeGame.white_player);
  const isParticipant = isBlack || isWhite;
  const myColor: StoneColor | null = isBlack ? 'BLACK' : isWhite ? 'WHITE' : null;
  const isMyTurn = isParticipant && myColor === derived.currentColor;

  // 先生が観戦中は myColor が null のまま currentColor 側の生徒の identity を代筆する
  const effectivePlayer = useMemo(() => {
    if (!activeGame) return null;
    if (myColor) return { identity: myIdentity, color: myColor };
    if (isTeacher) {
      return {
        identity: derived.currentColor === 'BLACK' ? activeGame.black_player : activeGame.white_player,
        color: derived.currentColor,
      };
    }
    return null;
  }, [activeGame, myColor, myIdentity, isTeacher, derived.currentColor]);

  const submitMoveFn = useCallback(
    async (x: number, y: number) => {
      if (!activeGame || !effectivePlayer) return;
      if (!isMyTurn && !isTeacher) return;
      
      const moveNumber = derived.moveNumber + 1;

      // 時計の切り替え
      let nextClock: GameClock | undefined = undefined;
      if (activeGame.clock) {
        nextClock = switchClock(activeGame.clock, effectivePlayer.color);
      }

      // 1. 楽観的更新（仮着手）
      const tempMove: LiveMoveRow = {
        game_id: activeGame.id,
        move_number: moveNumber,
        player_id: `temp-opt-${Date.now()}-${effectivePlayer.identity}`,
        x,
        y,
        color: effectivePlayer.color,
        created_at: new Date().toISOString(),
      };

      setMoves((prev) => {
        if (prev.some((m) => m.move_number === tempMove.move_number)) return prev;
        return [...prev, tempMove].sort((a, b) => a.move_number - b.move_number);
      });

      // 2. LiveKitデータチャネルでブロードキャスト（即時性のため）
      if (classroom && classroom.isConnected) {
        classroom.broadcast({
          type: 'GAME_MOVE',
          payload: {
            gameId: activeGame.id,
            x,
            y,
            color: effectivePlayer.color,
            moveNumber,
          } as GameMovePayload
        }).catch((err) => console.error('[LiveKit move broadcast error]', err));
      }

      // 3. Supabase（真実のソース）へ送信
      const res = await apiSubmitMove(activeGame.id, effectivePlayer.identity, x, y, effectivePlayer.color, nextClock);
      if (!res.ok) {
        setError(res.error ?? 'submit failed');
        // 失敗した場合は仮着手を削除
        setMoves((prev) => prev.filter((m) => m.player_id !== tempMove.player_id));
      }
    },
    [activeGame, effectivePlayer, derived.moveNumber, classroom, isMyTurn, isTeacher],
  );

  const submitPass = useCallback(async () => {
    if (!activeGame || !effectivePlayer) return;
    if (!isMyTurn && !isTeacher) return;
    const lastMove = derived.lastMove;
    const isSecondPass = lastMove && lastMove.x === 0 && lastMove.y === 0;
    const moveNumber = derived.moveNumber + 1;

    // 時計の切り替え
    let nextClock: GameClock | undefined = undefined;
    if (activeGame.clock) {
      nextClock = switchClock(activeGame.clock, effectivePlayer.color);
    }

    // 1. 楽観的更新
    const tempMove: LiveMoveRow = {
      game_id: activeGame.id,
      move_number: moveNumber,
      player_id: `temp-opt-${Date.now()}-${effectivePlayer.identity}`,
      x: 0,
      y: 0,
      color: effectivePlayer.color,
      created_at: new Date().toISOString(),
    };

    setMoves((prev) => {
      if (prev.some((m) => m.move_number === tempMove.move_number)) return prev;
      return [...prev, tempMove].sort((a, b) => a.move_number - b.move_number);
    });

    // 2. LiveKitデータチャネルでブロードキャスト
    if (classroom && classroom.isConnected) {
      classroom.broadcast({
        type: 'GAME_PASS',
        payload: {
          gameId: activeGame.id,
          color: effectivePlayer.color,
          moveNumber,
        }
      }).catch((err) => console.error('[LiveKit pass broadcast error]', err));
    }

    const res = await apiSubmitMove(activeGame.id, effectivePlayer.identity, 0, 0, effectivePlayer.color, nextClock);
    if (!res.ok) {
      setError(res.error ?? 'pass failed');
      // 失敗した場合は仮着手を削除
      setMoves((prev) => prev.filter((m) => m.player_id !== tempMove.player_id));
      return;
    }
    if (isSecondPass) {
      try {
        await apiEnterScoring(activeGame.id);
      } catch (e) {
        setError(String(e));
      }
    }
  }, [activeGame, effectivePlayer, derived.lastMove, derived.moveNumber, classroom, isMyTurn, isTeacher]);

  const [localClock, setLocalClock] = useState<GameClock | null>(null);

  // game.clock が更新されたら同期
  useEffect(() => {
    if (activeGame?.clock) {
      setLocalClock(activeGame.clock);
    } else {
      setLocalClock(null);
    }
  }, [activeGame?.clock]);

  // ローカルの時間切れ処理
  const handleLocalTimeUp = useCallback(
    async (color: 'BLACK' | 'WHITE') => {
      if (!activeGame) return;
      
      // 自分がその時間切れになったプレイヤーである場合、または先生である場合のみ終局APIを投げる
      const isMyTimeUp = myColor === color;
      if (isMyTimeUp || isTeacher) {
        const winner = color === 'BLACK' ? 'W' : 'B';
        try {
          await apiFinishGame(activeGame.id, `${winner}+T`);
        } catch (e) {
          console.error("Failed to finish game on timeup:", e);
        }
      }
    },
    [activeGame, myColor, isTeacher]
  );

  // 1秒ごとにローカル残り時間を減少させる
  useEffect(() => {
    if (!localClock || activeGame?.status !== 'playing') return;
    if (localClock.lastTickTime === null) return; // 時計が動いていない（一時停止中）

    const timer = setInterval(() => {
      setLocalClock((prev) => {
        if (!prev) return null;
        
        const isBlackTurn = derived.currentColor === 'BLACK';
        const now = Date.now();
        const elapsed = (now - (prev.lastTickTime || now)) / 1000;
        
        if (elapsed < 0.9) return prev; // 1秒未満はスキップ

        const timeLeft = isBlackTurn ? prev.blackTimeLeft : prev.whiteTimeLeft;
        const byoyomiLeft = isBlackTurn ? prev.blackByoyomiLeft : prev.whiteByoyomiLeft;

        let newTimeLeft = timeLeft - elapsed;
        let newByoyomiLeft = byoyomiLeft;

        if (newTimeLeft <= 0) {
          if (prev.byoyomiPeriods > 0 && newByoyomiLeft > 0) {
            // 秒読みを消費
            if (timeLeft > 0) {
              // 持ち時間切れ -> 秒読み開始
              newTimeLeft = prev.byoyomiSeconds;
            } else {
              // 秒読み中 -> 1回消費
              newByoyomiLeft -= 1;
              if (newByoyomiLeft <= 0) {
                // 時間切れ (切れ負け)
                clearInterval(timer);
                handleLocalTimeUp(derived.currentColor);
                return {
                  ...prev,
                  lastTickTime: now,
                  ...(isBlackTurn
                    ? { blackTimeLeft: 0, blackByoyomiLeft: 0 }
                    : { whiteTimeLeft: 0, whiteByoyomiLeft: 0 }),
                };
              }
              newTimeLeft = prev.byoyomiSeconds;
            }
          } else {
            // 持ち時間切れ (秒読みなし)
            clearInterval(timer);
            handleLocalTimeUp(derived.currentColor);
            return {
              ...prev,
              lastTickTime: now,
              ...(isBlackTurn
                ? { blackTimeLeft: 0, blackByoyomiLeft: 0 }
                : { whiteTimeLeft: 0, whiteByoyomiLeft: 0 }),
            };
          }
        }

        return {
          ...prev,
          lastTickTime: now,
          ...(isBlackTurn
            ? { blackTimeLeft: newTimeLeft, blackByoyomiLeft: newByoyomiLeft }
            : { whiteTimeLeft: newTimeLeft, whiteByoyomiLeft: newByoyomiLeft }),
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [localClock === null, activeGame?.status, derived.currentColor, handleLocalTimeUp]);

  const submitResign = useCallback(async () => {
    if (!activeGame || !effectivePlayer) return;
    const winner = effectivePlayer.color === 'BLACK' ? 'W' : 'B';
    try {
      await apiFinishGame(activeGame.id, `${winner}+R`);
    } catch (e) {
      setError(String(e));
    }
  }, [activeGame, effectivePlayer]);

  const enterScoringFn = useCallback(async () => {
    if (!activeGame) return;
    try {
      await apiEnterScoring(activeGame.id);
    } catch (e) {
      setError(String(e));
    }
  }, [activeGame]);

  const setDeadStones = useCallback(
    async (deadStones: string[]) => {
      if (!activeGame) return;
      try {
        await apiUpdateDeadStones(activeGame.id, deadStones);
      } catch (e) {
        setError(String(e));
      }
    },
    [activeGame],
  );

  const finishWithResult = useCallback(
    async (result: string) => {
      if (!activeGame) return;
      try {
        await apiFinishGame(activeGame.id, result);
      } catch (e) {
        setError(String(e));
      }
    },
    [activeGame],
  );

  const resetGame = useCallback(async () => {
    if (!activeGame) return;
    try {
      await apiResetLiveGame(activeGame.id);
    } catch (e) {
      setError(String(e));
    }
  }, [activeGame]);

  return {
    game: activeGame,
    boardState: derived.boardState,
    currentColor: derived.currentColor,
    moveNumber: derived.moveNumber,
    blackCaptures: derived.blackCaptures,
    whiteCaptures: derived.whiteCaptures,
    lastMove: derived.lastMove,
    moves: activeMoves,
    myColor,
    isParticipant,
    isMyTurn,
    clock: localClock,
    loading: activeLoading,
    error: activeError,
    submitMove: submitMoveFn,
    submitPass,
    submitResign,
    enterScoring: enterScoringFn,
    setDeadStones,
    finishWithResult,
    resetGame,
  };
}
