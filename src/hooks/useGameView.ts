import { useState, useCallback } from 'react';
import type { GameSession, GameBoardUpdatePayload, GameCreatedPayload, GameEndedPayload, GameListSyncPayload, ScoringUpdatePayload } from '../types/game';
import type { ClassroomMessage } from '../utils/classroomLiveKit';

// --- 生徒側も対局データをlocalStorageにキャッシュ ---
const STUDENT_GAMES_KEY = 'go-school-student-games';

function persistStudentGames(games: GameSession[]): void {
  try {
    localStorage.setItem(STUDENT_GAMES_KEY, JSON.stringify(games));
  } catch { /* ignore */ }
}

function restoreStudentGames(): GameSession[] {
  try {
    const data = localStorage.getItem(STUDENT_GAMES_KEY);
    if (!data) return [];
    return JSON.parse(data) as GameSession[];
  } catch {
    return [];
  }
}

// 生徒用：対局受信ロジック
export function useGameView() {
  const [games, setGames] = useState<GameSession[]>(() => restoreStudentGames());
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const updateGames = useCallback((updater: (prev: GameSession[]) => GameSession[]) => {
    setGames(prev => {
      const next = updater(prev);
      persistStudentGames(next);
      return next;
    });
  }, []);

  const handleGameMessage = useCallback((msg: ClassroomMessage) => {
    if (msg.type === 'GAME_CREATED') {
      const p = msg.payload as GameCreatedPayload;
      updateGames(prev => [...prev, p.game]);
    } else if (msg.type === 'GAME_BOARD_UPDATE') {
      const p = msg.payload as GameBoardUpdatePayload;
      updateGames(prev => prev.map(g => {
        if (g.id !== p.gameId) return g;
        return {
          ...g,
          boardState: p.boardState,
          currentColor: p.currentColor,
          moveNumber: p.moveNumber,
          blackCaptures: p.blackCaptures,
          whiteCaptures: p.whiteCaptures,
        };
      }));
    } else if (msg.type === 'GAME_ENDED') {
      const p = msg.payload as GameEndedPayload;
      updateGames(prev => prev.map(g => {
        if (g.id !== p.gameId) return g;
        return { ...g, status: 'finished', result: p.result, scoringDeadStones: undefined };
      }));
    } else if (msg.type === 'GAME_LIST_SYNC') {
      const p = msg.payload as GameListSyncPayload;
      // 先生から最新データを受信 → 完全上書き
      updateGames(() => p.games);
    } else if (msg.type === 'SCORING_UPDATE') {
      const p = msg.payload as ScoringUpdatePayload;
      updateGames(prev => prev.map(g => {
        if (g.id !== p.gameId) return g;
        return {
          ...g,
          status: p.status,
          scoringDeadStones: p.deadStones,
        };
      }));
    }
  }, [updateGames]);

  // 自分が参加中の対局を取得（playing or scoring）
  const getMyGame = useCallback((identity: string): GameSession | undefined => {
    return games.find(g =>
      (g.status === 'playing' || g.status === 'scoring') &&
      (g.blackPlayer === identity || g.whitePlayer === identity)
    );
  }, [games]);

  return {
    games,
    activeGameId,
    setActiveGameId,
    handleGameMessage,
    getMyGame,
  };
}
