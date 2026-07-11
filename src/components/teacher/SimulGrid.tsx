import { useMemo, useState } from 'react';
import type { Student } from '../../types/classroom';
import type { GameSession } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import { liveRowToSession, type LiveGameRow } from '../../utils/liveGameApi';
import { deriveLiveBoardSnapshots, useLiveBoards } from '../../hooks/useLiveBoards';
import GameThumbnail from '../GameThumbnail';
import SimulAddGameDialog from './SimulAddGameDialog';

interface SimulGridProps {
  games: LiveGameRow[];
  students: Student[];
  participants: ParticipantInfo[];
  teacherIdentity: string;
  onOpenGame: (gameId: string) => void;
  onCreateGame: (opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
    clock: null;
  }) => Promise<void>;
  autoReturnAfterMove: boolean;
  onToggleAutoReturnAfterMove: () => void;
  onBack: () => void;
}

function isTeacherParticipant(game: LiveGameRow, teacherIdentity: string): boolean {
  return game.black_player === teacherIdentity || game.white_player === teacherIdentity;
}

function isTeacherTurn(game: LiveGameRow, currentColor: 'BLACK' | 'WHITE', teacherIdentity: string): boolean {
  if (game.black_player === teacherIdentity) return currentColor === 'BLACK';
  if (game.white_player === teacherIdentity) return currentColor === 'WHITE';
  return false;
}

export default function SimulGrid({
  games,
  students,
  participants,
  teacherIdentity,
  onOpenGame,
  onCreateGame,
  autoReturnAfterMove,
  onToggleAutoReturnAfterMove,
  onBack,
}: SimulGridProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const simulGames = useMemo(
    () => games.filter((game) => isTeacherParticipant(game, teacherIdentity)),
    [games, teacherIdentity],
  );
  const { boards, loading, error } = useLiveBoards(simulGames);

  const sessions = useMemo(() => {
    return simulGames.map((game) => {
      const snapshot = boards.get(game.id) ?? deriveLiveBoardSnapshots([game], []).get(game.id)!;
      const session: GameSession = {
        ...liveRowToSession(game),
        boardState: snapshot.boardState,
        currentColor: snapshot.currentColor,
        moveNumber: snapshot.moveNumber,
      };
      return { game, snapshot, session };
    });
  }, [simulGames, boards]);

  const nextGameId = useMemo(() => {
    const waiting = sessions
      .filter(({ game, snapshot }) => game.status === 'playing' && isTeacherTurn(game, snapshot.currentColor, teacherIdentity))
      .sort((a, b) => {
        const aTime = a.snapshot.lastMoveAt ? Date.parse(a.snapshot.lastMoveAt) : 0;
        const bTime = b.snapshot.lastMoveAt ? Date.parse(b.snapshot.lastMoveAt) : 0;
        return aTime - bTime;
      });
    return waiting[0]?.game.id ?? null;
  }, [sessions, teacherIdentity]);

  return (
    <div style={{
      minHeight: '100%',
      background: '#d0d0c8',
      color: '#333',
      fontFamily: 'MS Gothic, "Noto Sans JP", monospace',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: 8,
        borderBottom: '2px solid #999',
        background: '#e8e8e0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={onBack}
            style={{ border: '1px solid #999', background: '#fff', padding: '3px 10px', cursor: 'pointer' }}
          >
            戻る
          </button>
          <strong style={{ fontSize: 14 }}>多面打ち</strong>
          <span style={{ color: '#666' }}>{simulGames.length}面</span>
          {loading && <span style={{ color: '#666' }}>盤面読込中...</span>}
          {error && <span style={{ color: '#b91c1c' }}>盤面エラー: {error}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={autoReturnAfterMove}
              onChange={onToggleAutoReturnAfterMove}
            />
            着手後に戻る
          </label>
          <button
            onClick={() => nextGameId && onOpenGame(nextGameId)}
            disabled={!nextGameId}
            style={{
              border: '1px solid #b45309',
              background: nextGameId ? '#f59e0b' : '#bbb',
              color: nextGameId ? '#111' : '#666',
              padding: '3px 12px',
              cursor: nextGameId ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
            }}
          >
            次の手番の盤へ
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            style={{ border: '1px solid #1e3a8a', background: '#3030a0', color: 'white', padding: '3px 12px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            対局を追加
          </button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <button
            onClick={() => setShowAddDialog(true)}
            style={{
              border: '2px solid #3030a0',
              background: '#fff',
              color: '#3030a0',
              padding: '10px 22px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: 14,
            }}
          >
            対局を追加
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 p-3">
          {sessions.map(({ game, snapshot, session }) => {
            const myTurn = game.status === 'playing' && isTeacherTurn(game, snapshot.currentColor, teacherIdentity);
            return (
              <GameThumbnail
                key={game.id}
                game={session}
                students={students}
                onClick={() => onOpenGame(game.id)}
                isMyTurn={myTurn}
                turnLabel={myTurn ? 'あなたの番' : game.status === 'playing' ? '相手考慮中' : '整地中'}
              />
            );
          })}
        </div>
      )}

      {showAddDialog && (
        <SimulAddGameDialog
          connectedIdentities={participants.map((p) => p.identity)}
          students={students}
          teacherIdentity={teacherIdentity}
          games={games}
          onClose={() => setShowAddDialog(false)}
          onCreate={onCreateGame}
        />
      )}
    </div>
  );
}
