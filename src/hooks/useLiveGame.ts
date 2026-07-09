import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StoneColor, BoardState } from '../components/GoBoard';
import { createEmptyBoard, checkCapture } from '../utils/gameLogic';
import { getHandicapStones } from '../utils/handicapStones';
import { studentMatchesPlayer } from '../utils/identityUtils';
import { getByoyomiAnnouncement, speakByoyomi } from '../utils/byoyomiVoice';
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
  type SubmitMoveResult,
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

// ---- 409（手番不一致/連番衝突）後の再送判定 ----
// 早指しでは、相手の直前の手がサーバー確定する前に自分の手を送ってしまうことがある
// （ローカルの手番はLiveKitブロードキャスト由来でサーバーより先行するため）。
// その場合サーバーは409で拒否するので、movesを取り直して手番を確認してから再送する。

export function isRetryableSubmitError(error?: string): boolean {
  return !!error && (error.includes('Not your turn') || error.includes('Move number already taken'));
}

export type SubmitRetryDecision =
  | { kind: 'already-applied'; moveNumber: number } // この手が既にサーバーに入っていた（送信の二重化）
  | { kind: 'retry' } // 手番が来ている → 再送してよい
  | { kind: 'wait' }; // 相手の手がまだサーバー未確定 → もう少し待つ

export function decideSubmitRetry(
  serverMoves: Pick<LiveMoveRow, 'move_number' | 'x' | 'y' | 'color'>[],
  color: StoneColor,
  x: number,
  y: number,
  handicap: number,
): SubmitRetryDecision {
  const last = serverMoves[serverMoves.length - 1];
  // 手番は交互なので、最後の手が自分の色かつ同座標なら、それはこの手自身（成功済み）
  if (last && last.color === color && last.x === x && last.y === y) {
    return { kind: 'already-applied', moveNumber: last.move_number };
  }
  const expectedColor: StoneColor = last
    ? last.color === 'BLACK'
      ? 'WHITE'
      : 'BLACK'
    : handicap >= 2
      ? 'WHITE'
      : 'BLACK';
  return expectedColor === color ? { kind: 'retry' } : { kind: 'wait' };
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
  const [localClock, setLocalClock] = useState<GameClock | null>(null);
  const channelRef = useRef<ReturnType<typeof subscribeLiveGame> | null>(null);
  const lastByoyomiSpeakRef = useRef<string | null>(null); // 秒読み読み上げの重複防止

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
        setLocalClock(g?.clock ?? null);
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
        setLocalClock(row.clock ?? null);
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

      if (msg.type === 'GAME_RESIGN') {
        const p = msg.payload as { gameId: string; color: StoneColor };
        if (p.gameId !== gameId) return;
        
        const winner = p.color === 'BLACK' ? 'W' : 'B';
        setGame((prev) => prev ? { ...prev, status: 'finished', result: `${winner}+R` } : null);
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

  // 対局者本人のみ着手できる。対局中の代打ちは（先生でも）一切不可。
  const effectivePlayer = useMemo(() => {
    if (!activeGame) return null;
    if (myColor) return { identity: myIdentity, color: myColor };
    return null;
  }, [activeGame, myColor, myIdentity]);

  // 409（手番不一致/連番衝突）で拒否された手を、サーバーmoves再取得→手番確認のうえ
  // 限定回数だけ再送する。相手の手の永続化を追い越して送信した場合の取りこぼしを防ぐ。
  const retrySubmitAfterResync = useCallback(
    async (
      game: LiveGameRow,
      player: { identity: string; color: StoneColor },
      x: number,
      y: number,
      clock: GameClock | undefined,
      firstError: string | undefined,
    ): Promise<SubmitMoveResult> => {
      let lastResult: SubmitMoveResult = { ok: false, error: firstError };
      for (let attempt = 1; attempt <= 2; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        let serverMoves: LiveMoveRow[];
        try {
          serverMoves = await fetchLiveMoves(game.id);
        } catch {
          continue;
        }
        const decision = decideSubmitRetry(serverMoves, player.color, x, y, game.handicap);
        if (decision.kind === 'already-applied') {
          return { ok: true, move_number: decision.moveNumber };
        }
        if (decision.kind === 'wait') continue;
        console.warn(`[useLiveGame] 手番同期の遅れを検知、着手を再送します (attempt ${attempt})`);
        lastResult = await apiSubmitMove(game.id, player.identity, x, y, player.color, clock);
        if (lastResult.ok || !isRetryableSubmitError(lastResult.error)) return lastResult;
      }
      return lastResult;
    },
    [],
  );

  const submitMoveFn = useCallback(
    async (x: number, y: number) => {
      if (!activeGame || !effectivePlayer) return;
      // 手番の対局者本人のみ着手可能（代打ち不可）。楽観的更新・LiveKit配信の前に弾く。
      if (!isMyTurn) return;
      if (effectivePlayer.color !== derived.currentColor) return;

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
      let res = await apiSubmitMove(activeGame.id, effectivePlayer.identity, x, y, effectivePlayer.color, nextClock);
      if (!res.ok && isRetryableSubmitError(res.error)) {
        res = await retrySubmitAfterResync(activeGame, effectivePlayer, x, y, nextClock, res.error);
      }
      if (!res.ok) {
        setError(res.error ?? 'submit failed');
        // 失敗した場合は仮着手を削除
        setMoves((prev) => prev.filter((m) => m.player_id !== tempMove.player_id));
      }
    },
    [activeGame, effectivePlayer, derived.moveNumber, derived.currentColor, classroom, isMyTurn, retrySubmitAfterResync],
  );

  const submitPass = useCallback(async () => {
    if (!activeGame || !effectivePlayer) return;
    if (!isMyTurn) return;
    if (effectivePlayer.color !== derived.currentColor) return;
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

    let res = await apiSubmitMove(activeGame.id, effectivePlayer.identity, 0, 0, effectivePlayer.color, nextClock);
    if (!res.ok && isRetryableSubmitError(res.error)) {
      res = await retrySubmitAfterResync(activeGame, effectivePlayer, 0, 0, nextClock, res.error);
    }
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
  }, [activeGame, effectivePlayer, derived.lastMove, derived.moveNumber, derived.currentColor, classroom, isMyTurn, retrySubmitAfterResync]);

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

  const hasLocalClock = localClock !== null;
  const activeGameStatus = activeGame?.status;

  // 1秒ごとにローカル残り時間を減少させる
  useEffect(() => {
    if (!localClock || activeGameStatus !== 'playing') return;
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
        const inByoyomi = isBlackTurn ? prev.blackInByoyomi : prev.whiteInByoyomi;

        let newTimeLeft = timeLeft - elapsed;
        let newByoyomiLeft = byoyomiLeft;
        let newInByoyomi = inByoyomi ?? false;

        if (newTimeLeft <= 0) {
          if (!newInByoyomi) {
            // 持ち時間切れ
            if (prev.byoyomiPeriods > 0) {
              // 秒読み開始（回数はまだ消費しない）
              newInByoyomi = true;
              newTimeLeft = prev.byoyomiSeconds;
            } else {
              // 秒読みなし → 切れ負け
              speakByoyomi('時間切れ負けです');
              clearInterval(timer);
              handleLocalTimeUp(derived.currentColor);
              return {
                ...prev,
                lastTickTime: now,
                ...(isBlackTurn
                  ? { blackTimeLeft: 0 }
                  : { whiteTimeLeft: 0 }),
              };
            }
          } else {
            // 秒読みを1回使い切った → 回数を消費
            newByoyomiLeft -= 1;
            if (newByoyomiLeft <= 0) {
              // 最後の秒読みを使い切り → 「10」まで数えて時間切れ負け
              speakByoyomi('10、時間切れ負けです');
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
            // 回を消費した瞬間の告知（残りN回です／最後の考慮時間に入りました）
            const transition = getByoyomiAnnouncement(prev.byoyomiSeconds, prev.byoyomiSeconds, byoyomiLeft);
            if (transition) speakByoyomi(transition);
            newTimeLeft = prev.byoyomiSeconds;
          }
        }

        // 秒読み中の各秒の読み上げ（10秒・20秒・25秒・1〜9 等）
        if (newInByoyomi && newTimeLeft > 0) {
          const elapsedSec = Math.round(prev.byoyomiSeconds - newTimeLeft);
          const phrase = getByoyomiAnnouncement(prev.byoyomiSeconds, elapsedSec, newByoyomiLeft);
          const key = `${derived.currentColor}:${newByoyomiLeft}:${elapsedSec}`;
          if (phrase && lastByoyomiSpeakRef.current !== key) {
            lastByoyomiSpeakRef.current = key;
            speakByoyomi(phrase);
          }
        }

        return {
          ...prev,
          lastTickTime: now,
          ...(isBlackTurn
            ? { blackTimeLeft: newTimeLeft, blackByoyomiLeft: newByoyomiLeft, blackInByoyomi: newInByoyomi }
            : { whiteTimeLeft: newTimeLeft, whiteByoyomiLeft: newByoyomiLeft, whiteInByoyomi: newInByoyomi }),
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasLocalClock, activeGameStatus, derived.currentColor, handleLocalTimeUp]);

  const submitResign = useCallback(async () => {
    // 投了は手番の対局者本人のみ。観戦者・非対局者・相手番では何もしない。
    if (!activeGame || !effectivePlayer || !isMyTurn) return;
    const winner = effectivePlayer.color === 'BLACK' ? 'W' : 'B';

    // 先にサーバー（真実のソース）へ確定させる。失敗したら対局中のままにしない。
    try {
      await apiFinishGame(activeGame.id, `${winner}+R`);
    } catch (e) {
      setError(String(e));
      return;
    }

    // LiveKitデータチャネルでブロードキャスト（相手・観戦者へ即時反映）
    if (classroom && classroom.isConnected) {
      classroom.broadcast({
        type: 'GAME_RESIGN',
        payload: {
          gameId: activeGame.id,
          color: effectivePlayer.color,
        }
      }).catch((err) => console.error('[LiveKit resign broadcast error]', err));
    }

    // ローカルゲーム状態を finished に更新（Realtime 反映前の応答性のため）
    setGame((prev) => prev ? { ...prev, status: 'finished', result: `${winner}+R` } : null);
  }, [activeGame, effectivePlayer, isMyTurn, classroom]);

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
