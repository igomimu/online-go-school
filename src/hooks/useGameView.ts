import { useState, useCallback } from 'react';
import type { GameSession, GameBoardUpdatePayload, GameCreatedPayload, GameEndedPayload, GameListSyncPayload } from '../types/game';
import type { ClassroomMessage } from '../utils/classroomLiveKit';

// 生徒用：対局受信ロジック
export function useGameView() {
  const [games, setGames] = useState<GameSession[]>([]);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);

  const handleGameMessage = useCallback((msg: ClassroomMessage) => {
    if (msg.type === 'GAME_CREATED') {
      const p = msg.payload as GameCreatedPayload;
      setGames(prev => [...prev, p.game]);
    } else if (msg.type === 'GAME_BOARD_UPDATE') {
      const p = msg.payload as GameBoardUpdatePayload;
      setGames(prev => prev.map(g => {
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
      setGames(prev => prev.map(g => {
        if (g.id !== p.gameId) return g;
        return { ...g, status: 'finished', result: p.result };
      }));
    } else if (msg.type === 'GAME_LIST_SYNC') {
      const p = msg.payload as GameListSyncPayload;
      setGames(p.games);
    }
  }, []);

  // 自分が参加中の対局を取得
  const getMyGame = useCallback((identity: string): GameSession | undefined => {
    return games.find(g =>
      g.status === 'playing' && (g.blackPlayer === identity || g.whitePlayer === identity)
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
