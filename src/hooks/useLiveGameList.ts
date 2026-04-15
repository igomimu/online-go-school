import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLiveGames,
  createLiveGame as apiCreateLiveGame,
  subscribeClassroomGames,
  type LiveGameRow,
  type CreateLiveGameOpts,
} from '../utils/liveGameApi';

export interface UseLiveGameListResult {
  games: LiveGameRow[];
  loading: boolean;
  error: string | null;
  createGame: (opts: Omit<CreateLiveGameOpts, 'classroomId'>) => Promise<LiveGameRow | null>;
  refresh: () => Promise<void>;
}

export function useLiveGameList(classroomId: string | null): UseLiveGameListResult {
  const [games, setGames] = useState<LiveGameRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof subscribeClassroomGames> | null>(null);

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
      setGames([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const rows = await fetchLiveGames(classroomId);
        if (cancelled) return;
        setGames(rows);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      }
    })();

    const channel = subscribeClassroomGames(classroomId, {
      onInsert: (row) => {
        setGames((prev) => {
          if (prev.some((g) => g.id === row.id)) return prev;
          return [row, ...prev];
        });
      },
      onUpdate: (row) => {
        setGames((prev) => {
          // finishedになったら一覧から除外
          if (row.status === 'finished') {
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

    return () => {
      cancelled = true;
      channel.unsubscribe();
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

  return { games, loading, error, createGame, refresh };
}
