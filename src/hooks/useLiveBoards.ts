import { useEffect, useMemo, useState } from 'react';
import type { BoardState, StoneColor } from '../components/GoBoard';
import { createEmptyBoard } from '../utils/gameLogic';
import {
  fetchLiveMovesForGames,
  subscribeLiveMovesForGames,
  type LiveGameRow,
  type LiveMoveRow,
} from '../utils/liveGameApi';
import { deriveBoardState } from './useLiveGame';

export interface LiveBoardSnapshot {
  boardState: BoardState;
  currentColor: StoneColor;
  moveNumber: number;
  lastMoveAt: string | null;
}

export interface UseLiveBoardsResult {
  boards: Map<string, LiveBoardSnapshot>;
  loading: boolean;
  error: string | null;
}

const EMPTY_BOARDS = new Map<string, LiveBoardSnapshot>();

function groupMovesByGame(moves: LiveMoveRow[]): Map<string, LiveMoveRow[]> {
  const grouped = new Map<string, LiveMoveRow[]>();
  for (const move of moves) {
    const list = grouped.get(move.game_id) ?? [];
    list.push(move);
    grouped.set(move.game_id, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.move_number - b.move_number);
  }
  return grouped;
}

export function deriveLiveBoardSnapshots(
  games: LiveGameRow[],
  moves: LiveMoveRow[],
): Map<string, LiveBoardSnapshot> {
  if (games.length === 0) return EMPTY_BOARDS;

  const groupedMoves = groupMovesByGame(moves);
  const boards = new Map<string, LiveBoardSnapshot>();

  for (const game of games) {
    const gameMoves = groupedMoves.get(game.id) ?? [];
    const derived = deriveBoardState(game, gameMoves);
    boards.set(game.id, {
      boardState: derived.boardState,
      currentColor: derived.currentColor,
      moveNumber: derived.moveNumber,
      lastMoveAt: derived.lastMove?.created_at ?? game.created_at ?? null,
    });
  }

  return boards;
}

export function useLiveBoards(games: LiveGameRow[]): UseLiveBoardsResult {
  const gameIds = useMemo(() => games.map((g) => g.id), [games]);
  const gameIdsKey = useMemo(() => gameIds.slice().sort().join(','), [gameIds]);
  const [movesByGame, setMovesByGame] = useState<Map<string, LiveMoveRow[]>>(() => new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (gameIds.length === 0) {
      setMovesByGame(new Map());
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    fetchLiveMovesForGames(gameIds)
      .then((moves) => {
        if (cancelled) return;
        setMovesByGame(groupMovesByGame(moves));
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(String(err));
        setLoading(false);
      });

    const channel = subscribeLiveMovesForGames(gameIds, (row) => {
      setMovesByGame((prev) => {
        const next = new Map(prev);
        const list = next.get(row.game_id) ?? [];
        if (list.some((m) => m.move_number === row.move_number)) return prev;
        next.set(row.game_id, [...list, row].sort((a, b) => a.move_number - b.move_number));
        return next;
      });
    });

    return () => {
      cancelled = true;
      channel.unsubscribe();
    };
    // gameIdsKey is the stable subscription boundary; gameIds is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameIdsKey]);

  const moves = useMemo(
    () => Array.from(movesByGame.values()).flat(),
    [movesByGame],
  );
  const boards = useMemo(
    () => deriveLiveBoardSnapshots(games, moves),
    [games, moves],
  );

  return { boards, loading, error };
}

export function emptyLiveBoard(size: number): LiveBoardSnapshot {
  return {
    boardState: createEmptyBoard(size),
    currentColor: 'BLACK',
    moveNumber: 0,
    lastMoveAt: null,
  };
}
