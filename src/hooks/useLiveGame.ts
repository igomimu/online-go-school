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
      setGame(null);
      setMoves([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
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

  const derived = useMemo<DerivedState>(() => {
    if (!game) {
      return {
        boardState: createEmptyBoard(19),
        currentColor: 'BLACK',
        moveNumber: 0,
        blackCaptures: 0,
        whiteCaptures: 0,
        lastMove: null,
      };
    }
    return deriveBoardState(game, moves);
  }, [game, moves]);

  const isBlack = !!game && game.black_player === myIdentity;
  const isWhite = !!game && game.white_player === myIdentity;
  const isParticipant = isBlack || isWhite;
  const myColor: StoneColor | null = isBlack ? 'BLACK' : isWhite ? 'WHITE' : null;
  const isMyTurn = isParticipant && myColor === derived.currentColor;

  // 先生が観戦中は myColor が null のまま currentColor 側の生徒の identity を代筆する
  const effectivePlayer = useMemo(() => {
    if (!game) return null;
    if (myColor) return { identity: myIdentity, color: myColor };
    if (isTeacher) {
      return {
        identity: derived.currentColor === 'BLACK' ? game.black_player : game.white_player,
        color: derived.currentColor,
      };
    }
    return null;
  }, [game, myColor, myIdentity, isTeacher, derived.currentColor]);

  const submitMoveFn = useCallback(
    async (x: number, y: number) => {
      if (!game || !effectivePlayer) return;
      const res = await apiSubmitMove(game.id, effectivePlayer.identity, x, y, effectivePlayer.color);
      if (!res.ok) setError(res.error ?? 'submit failed');
    },
    [game, effectivePlayer],
  );

  const submitPass = useCallback(async () => {
    if (!game || !effectivePlayer) return;
    // 連続パスなら整地へ（ローカルstate基準。Realtimeラグのためピタッと当たらない場合は先生が手動遷移可）
    const lastMove = derived.lastMove;
    const isSecondPass = lastMove && lastMove.x === 0 && lastMove.y === 0;

    const res = await apiSubmitMove(game.id, effectivePlayer.identity, 0, 0, effectivePlayer.color);
    if (!res.ok) {
      setError(res.error ?? 'pass failed');
      return;
    }
    if (isSecondPass) {
      try {
        await apiEnterScoring(game.id);
      } catch (e) {
        setError(String(e));
      }
    }
  }, [game, effectivePlayer, derived.lastMove]);

  const submitResign = useCallback(async () => {
    if (!game || !effectivePlayer) return;
    const winner = effectivePlayer.color === 'BLACK' ? 'W' : 'B';
    try {
      await apiFinishGame(game.id, `${winner}+R`);
    } catch (e) {
      setError(String(e));
    }
  }, [game, effectivePlayer]);

  const enterScoringFn = useCallback(async () => {
    if (!game) return;
    try {
      await apiEnterScoring(game.id);
    } catch (e) {
      setError(String(e));
    }
  }, [game]);

  const setDeadStones = useCallback(
    async (deadStones: string[]) => {
      if (!game) return;
      try {
        await apiUpdateDeadStones(game.id, deadStones);
      } catch (e) {
        setError(String(e));
      }
    },
    [game],
  );

  const finishWithResult = useCallback(
    async (result: string) => {
      if (!game) return;
      try {
        await apiFinishGame(game.id, result);
      } catch (e) {
        setError(String(e));
      }
    },
    [game],
  );

  return {
    game,
    boardState: derived.boardState,
    currentColor: derived.currentColor,
    moveNumber: derived.moveNumber,
    blackCaptures: derived.blackCaptures,
    whiteCaptures: derived.whiteCaptures,
    lastMove: derived.lastMove,
    moves,
    myColor,
    isParticipant,
    isMyTurn,
    loading,
    error,
    submitMove: submitMoveFn,
    submitPass,
    submitResign,
    enterScoring: enterScoringFn,
    setDeadStones,
    finishWithResult,
  };
}
