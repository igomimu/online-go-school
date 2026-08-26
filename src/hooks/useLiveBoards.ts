import { useEffect, useMemo, useState } from 'react';
import type { BoardState, StoneColor } from '../components/GoBoard';
import type { GameSession } from '../types/game';
import { createEmptyBoard } from '../utils/gameLogic';
import {
  ensureRealtimeAuth,
  fetchLiveMovesForGames,
  subscribeLiveMovesForGames,
  type LiveGameRow,
  type LiveMoveRow,
} from '../utils/liveGameApi';
import { reconcileLiveMoves } from '../utils/liveMoveReconcile';
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

/**
 * 一覧の盤も定期的にサーバーの棋譜へ追いつかせる。
 *
 * 2026-08-26 の実授業で「対局中、ホーム画面の碁盤だけ盤面がズレていた」。
 * 対局盤（useLiveGame）は games の更新を合図にした再取得と3秒ごとの照合を
 * 持っているが、こちらは最初の取得と購読だけで、間に落ちた手を拾う道が無かった。
 * 手が一つ欠けると deriveBoardState は取りを再現できないので、盤はそこから
 * ずっと壊れたままになる。
 *
 * 一覧は複数局をまとめて取るぶんクエリが重く、即時性も対局盤ほど要らないので
 * 間隔は対局盤（3秒）より長くとる。
 */
const BOARDS_RECONCILE_INTERVAL_MS = 5000;

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

export function applyLiveBoardSnapshotsToSessions(
  games: GameSession[],
  boards: Map<string, LiveBoardSnapshot>,
): GameSession[] {
  return games.map((game) => {
    const snapshot = boards.get(game.id);
    if (!snapshot) return game;
    return {
      ...game,
      boardState: snapshot.boardState,
      currentColor: snapshot.currentColor,
      moveNumber: snapshot.moveNumber,
    };
  });
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

    let reconcileInFlight = false;
    const reconcileFromServer = async () => {
      if (reconcileInFlight || cancelled) return;
      reconcileInFlight = true;
      try {
        const serverMoves = await fetchLiveMovesForGames(gameIds);
        if (cancelled) return;
        const grouped = groupMovesByGame(serverMoves);
        setMovesByGame((prev) => {
          const next = new Map<string, LiveMoveRow[]>();
          for (const id of gameIds) {
            next.set(id, reconcileLiveMoves(prev.get(id) ?? [], grouped.get(id) ?? []));
          }
          return next;
        });
      } catch {
        // Realtimeが正常な間は無視できる保険経路。次回の照合で拾い直す。
      } finally {
        reconcileInFlight = false;
      }
    };

    // 購読はセッション復元後に行う（購読時トークンでRLSが評価されるため。ensureRealtimeAuth参照）
    let channel: ReturnType<typeof subscribeLiveMovesForGames> | null = null;
    (async () => {
      await ensureRealtimeAuth();
      if (cancelled) return;
      channel = subscribeLiveMovesForGames(gameIds, (row) => {
        setMovesByGame((prev) => {
          const next = new Map(prev);
          const list = next.get(row.game_id) ?? [];
          if (list.some((m) => m.move_number === row.move_number)) return prev;
          next.set(row.game_id, [...list, row].sort((a, b) => a.move_number - b.move_number));
          return next;
        });
      });
      // 最初の取得と購読開始の間に打たれた手は、どちらにも入らず永久に欠ける。
      // 購読が立ったらもう一度サーバーを見て、その隙間を埋める。
      void reconcileFromServer();
    })();

    const reconcileTimer = window.setInterval(() => {
      void reconcileFromServer();
    }, BOARDS_RECONCILE_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(reconcileTimer);
      channel?.unsubscribe();
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
