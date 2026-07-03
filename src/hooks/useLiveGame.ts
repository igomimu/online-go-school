import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StoneColor, BoardState } from '../components/GoBoard';
import { createEmptyBoard, checkCapture } from '../utils/gameLogic';
import { getHandicapStones } from '../utils/handicapStones';
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
          // 重複防止（自分が送信した着手が既に反映されている場合）
          if (prev.some((m) => m.move_number === row.move_number)) return prev;
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

  const isBlack = !!activeGame && activeGame.black_player === myIdentity;
  const isWhite = !!activeGame && activeGame.white_player === myIdentity;
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
      const res = await apiSubmitMove(activeGame.id, effectivePlayer.identity, x, y, effectivePlayer.color);
      if (!res.ok) setError(res.error ?? 'submit failed');
    },
    [activeGame, effectivePlayer],
  );

  const submitPass = useCallback(async () => {
    if (!activeGame || !effectivePlayer) return;
    // 連続パスなら整地へ（ローカルstate基準。Realtimeラグのためピタッと当たらない場合は先生が手動遷移可）
    const lastMove = derived.lastMove;
    const isSecondPass = lastMove && lastMove.x === 0 && lastMove.y === 0;

    const res = await apiSubmitMove(activeGame.id, effectivePlayer.identity, 0, 0, effectivePlayer.color);
    if (!res.ok) {
      setError(res.error ?? 'pass failed');
      return;
    }
    if (isSecondPass) {
      try {
        await apiEnterScoring(activeGame.id);
      } catch (e) {
        setError(String(e));
      }
    }
  }, [activeGame, effectivePlayer, derived.lastMove]);

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
