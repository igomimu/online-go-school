import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureRealtimeAuth,
  fetchLiveGames,
  createLiveGame as apiCreateLiveGame,
  subscribeClassroomGames,
  type LiveGameRow,
  type CreateLiveGameOpts,
} from '../utils/liveGameApi';
import { isTimeoutResult } from '../utils/scoring';

export interface UseLiveGameListResult {
  games: LiveGameRow[];
  loading: boolean;
  error: string | null;
  /** Realtimeで新たに終局を受けた瞬間だけ更新されるイベント（初期読込済みの終局は含めない）。 */
  finishedGameEvent: { sequence: number; game: LiveGameRow } | null;
  createGame: (opts: Omit<CreateLiveGameOpts, 'classroomId'>) => Promise<LiveGameRow | null>;
  refresh: () => Promise<void>;
}

const EMPTY_GAMES: LiveGameRow[] = [];

export function useLiveGameList(classroomId: string | null): UseLiveGameListResult {
  const [games, setGames] = useState<LiveGameRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [finishedGameEvent, setFinishedGameEvent] = useState<{ sequence: number; game: LiveGameRow } | null>(null);
  const channelRef = useRef<ReturnType<typeof subscribeClassroomGames> | null>(null);
  const seenFinishedGameIdsRef = useRef(new Set<string>());
  const finishedSequenceRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!classroomId) {
      setGames([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await fetchLiveGames(classroomId);
      setGames(rows);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [classroomId]);

  useEffect(() => {
    if (!classroomId) {
      return;
    }

    let cancelled = false;
    seenFinishedGameIdsRef.current.clear();

    (async () => {
      setLoading(true);
      try {
        const rows = await fetchLiveGames(classroomId);
        if (cancelled) return;
        // 画面を開いた時点で既に終わっている時間切れ対局などは通知しない。
        for (const row of rows) {
          if (row.status === 'finished') seenFinishedGameIdsRef.current.add(row.id);
        }
        setGames(rows);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      }
    })();

    // 購読はセッション復元後に行う（購読時トークンでRLSが評価されるため。ensureRealtimeAuth参照）
    let channel: ReturnType<typeof subscribeClassroomGames> | null = null;
    (async () => {
      await ensureRealtimeAuth();
      if (cancelled) return;
      channel = subscribeClassroomGames(classroomId, {
        onInsert: (row) => {
          setGames((prev) => {
            if (prev.some((g) => g.id === row.id)) return prev;
            return [row, ...prev];
          });
        },
        onUpdate: (row) => {
          if (row.status === 'finished') {
            if (!seenFinishedGameIdsRef.current.has(row.id)) {
              seenFinishedGameIdsRef.current.add(row.id);
              finishedSequenceRef.current += 1;
              setFinishedGameEvent({ sequence: finishedSequenceRef.current, game: row });
            }
          } else {
            // 再開後に同じ対局がもう一度終局した場合も知らせる。
            seenFinishedGameIdsRef.current.delete(row.id);
          }
          setGames((prev) => {
            // finishedになったら一覧から除外。
            // ただし時間切れ終局だけは、講師が「再開」を押せるよう一覧に残す。
            if (row.status === 'finished' && !isTimeoutResult(row.result)) {
              return prev.filter((g) => g.id !== row.id);
            }
            const idx = prev.findIndex((g) => g.id === row.id);
            if (idx === -1) return [row, ...prev];
            const next = [...prev];
            next[idx] = row;
            return next;
          });
        },
        onDelete: (row) => {
          setGames((prev) => prev.filter((g) => g.id !== row.id));
        },
      });
      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      channel?.unsubscribe();
      channelRef.current = null;
    };
  }, [classroomId]);

  const createGame = useCallback(
    async (opts: Omit<CreateLiveGameOpts, 'classroomId'>) => {
      if (!classroomId) return null;
      try {
        const row = await apiCreateLiveGame({ ...opts, classroomId });
        return row;
      } catch (e) {
        setError(String(e));
        return null;
      }
    },
    [classroomId],
  );

  return {
    games: classroomId ? games : EMPTY_GAMES,
    loading: classroomId ? loading : false,
    error: classroomId ? error : null,
    finishedGameEvent: classroomId ? finishedGameEvent : null,
    createGame,
    refresh,
  };
}
