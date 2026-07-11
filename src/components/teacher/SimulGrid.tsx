import { useMemo, useState, useEffect, useRef } from 'react';
import type { Student } from '../../types/classroom';
import type { GameClock } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import { ClassroomLiveKit } from '../../utils/classroomLiveKit';
import { liveRowToSession, type LiveGameRow } from '../../utils/liveGameApi';
import { deriveLiveBoardSnapshots, useLiveBoards } from '../../hooks/useLiveBoards';
import GameThumbnail from '../GameThumbnail';
import GameBoard from '../GameBoard';
import SimulAddGameDialog from './SimulAddGameDialog';

interface SimulGridProps {
  games: LiveGameRow[];
  students: Student[];
  participants: ParticipantInfo[];
  teacherIdentity: string;
  onCreateGame: (opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
    clock?: GameClock | null;
  }) => Promise<void>;
  onBack: () => void;
  classroom?: ClassroomLiveKit | null;
}

export interface GameSessionInfo {
  game: {
    id: string;
    status: string;
    black_player: string;
    white_player: string;
  };
  snapshot: {
    currentColor: 'BLACK' | 'WHITE';
    lastMoveAt?: string | null;
  };
}

export function isTeacherParticipant(game: { black_player: string; white_player: string; }, teacherIdentity: string): boolean {
  return game.black_player === teacherIdentity || game.white_player === teacherIdentity;
}

export function isTeacherTurn(game: { black_player: string; white_player: string; }, currentColor: 'BLACK' | 'WHITE', teacherIdentity: string): boolean {
  if (game.black_player === teacherIdentity) return currentColor === 'BLACK';
  if (game.white_player === teacherIdentity) return currentColor === 'WHITE';
  return false;
}

export function getNextTeacherTurnGameId(
  sessions: GameSessionInfo[],
  teacherIdentity: string
): string | null {
  const waiting = sessions
    .filter(({ game, snapshot }) =>
      game.status === 'playing' &&
      isTeacherTurn(game, snapshot.currentColor, teacherIdentity)
    )
    .sort((a, b) => {
      const aTime = a.snapshot.lastMoveAt ? Date.parse(a.snapshot.lastMoveAt) : 0;
      const bTime = b.snapshot.lastMoveAt ? Date.parse(b.snapshot.lastMoveAt) : 0;
      return aTime - bTime;
    });
  return waiting[0]?.game.id ?? null;
}

export default function SimulGrid({
  games,
  students,
  participants,
  teacherIdentity,
  onCreateGame,
  onBack,
  classroom,
}: SimulGridProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeSimulGameId, setActiveSimulGameId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const simulGames = useMemo(
    () => games.filter((game) => isTeacherParticipant(game, teacherIdentity)),
    [games, teacherIdentity],
  );
  const { boards, loading, error } = useLiveBoards(simulGames);

  const sessions = useMemo(() => {
    return simulGames.map((game) => {
      const snapshot = boards.get(game.id) ?? deriveLiveBoardSnapshots([game], []).get(game.id)!;
      const session = {
        ...liveRowToSession(game),
        boardState: snapshot.boardState,
        currentColor: snapshot.currentColor,
        moveNumber: snapshot.moveNumber,
      };
      return { game, snapshot, session };
    });
  }, [simulGames, boards]);

  // 次の手番の盤のIDを算出
  const nextGameId = useMemo(() => {
    return getNextTeacherTurnGameId(sessions, teacherIdentity);
  }, [sessions, teacherIdentity]);

  // 対局の進行状態を監視するためのハッシュ
  const sessionsStateHash = useMemo(() => {
    return sessions
      .map(s => `${s.game.id}:${s.game.status}:${s.snapshot.currentColor}:${s.snapshot.moveNumber}`)
      .join('|');
  }, [sessions]);

  // 前回のハッシュを保持する ref
  const lastStateHashRef = useRef(sessionsStateHash);

  // 自動切替 useEffect (v2 切替ロジックの核心)
  useEffect(() => {
    if (loading) return;

    const activeSession = sessions.find(s => s.game.id === activeSimulGameId);

    // 1. 表示中の盤が対局リストにない、または未設定の場合の初期・フォールバック選択 (ハッシュ関係なく処理)
    if (!activeSession) {
      const nextId = getNextTeacherTurnGameId(sessions, teacherIdentity);
      if (nextId) {
        setActiveSimulGameId(nextId);
      } else if (sessions.length > 0) {
        setActiveSimulGameId(sessions[0].game.id);
      } else {
        setActiveSimulGameId(null);
      }
      lastStateHashRef.current = sessionsStateHash;
      return;
    }

    // 2. 整地中 (scoring) の盤を表示している間は自動切替をスキップ (誤動作防止)
    if (activeSession.game.status === 'scoring') {
      lastStateHashRef.current = sessionsStateHash;
      return;
    }

    // 実際の対局進行（手番、手数など）に変化があった場合のみ自動切替を走らせる
    const hasStateChanged = lastStateHashRef.current !== sessionsStateHash;
    lastStateHashRef.current = sessionsStateHash;

    if (hasStateChanged) {
      // 3. 自分の手番でない && 他に自分の手番の盤がある場合に自動で切り替える
      const myTurn = activeSession.game.status === 'playing' && isTeacherTurn(activeSession.game, activeSession.snapshot.currentColor, teacherIdentity);
      if (!myTurn) {
        const nextId = getNextTeacherTurnGameId(sessions, teacherIdentity);
        if (nextId && nextId !== activeSimulGameId) {
          setActiveSimulGameId(nextId);
        }
      }
    }
  }, [sessions, sessionsStateHash, activeSimulGameId, teacherIdentity, loading]);

  const waitingCount = useMemo(() => {
    return sessions.filter(s => s.game.status === 'playing' && isTeacherTurn(s.game, s.snapshot.currentColor, teacherIdentity)).length;
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
      {/* 上部バー */}
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
            style={{ border: '1px solid #999', background: '#fff', padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
          >
            戻る
          </button>
          <strong style={{ fontSize: 14 }}>多面打ち</strong>
          <span style={{ color: '#666', fontSize: 12 }}>
            {sessions.length}面（あなたの番 {waitingCount}面）
          </span>
          {loading && <span style={{ color: '#666', fontSize: 12 }}>盤面読込中...</span>}
          {error && <span style={{ color: '#b91c1c', fontSize: 12 }}>盤面エラー: {error}</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowList(prev => !prev)}
            style={{ border: '1px solid #999', background: showList ? '#ccc' : '#fff', padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
          >
            {showList ? '盤面表示' : '一覧'}
          </button>
          <button
            onClick={() => {
              if (nextGameId) {
                setActiveSimulGameId(nextGameId);
                setShowList(false);
              }
            }}
            disabled={!nextGameId}
            style={{
              border: '1px solid #b45309',
              background: nextGameId ? '#f59e0b' : '#bbb',
              color: nextGameId ? '#111' : '#666',
              padding: '3px 12px',
              cursor: nextGameId ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: 12,
            }}
          >
            次の手番の盤へ
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            style={{ border: '1px solid #1e3a8a', background: '#3030a0', color: 'white', padding: '3px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
          >
            対局を追加
          </button>
        </div>
      </div>

      {/* 本体コンテンツ */}
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
      ) : showList ? (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 p-3">
          {sessions.map(({ game, snapshot, session }) => {
            const myTurn = game.status === 'playing' && isTeacherTurn(game, snapshot.currentColor, teacherIdentity);
            return (
              <GameThumbnail
                key={game.id}
                game={session}
                students={students}
                onClick={() => {
                  setActiveSimulGameId(game.id);
                  setShowList(false);
                }}
                isMyTurn={myTurn}
                turnLabel={
                  myTurn
                    ? 'あなたの番'
                    : game.status === 'playing'
                      ? '相手考慮中'
                      : game.status === 'scoring'
                        ? '整地中'
                        : '中断'
                }
              />
            );
          })}
        </div>
      ) : activeSimulGameId ? (
        <div data-testid="simul-active-board" className="flex-1 bg-zinc-950 p-2 sm:p-4 text-white overflow-y-auto">
          <GameBoard
            key={activeSimulGameId}
            gameId={activeSimulGameId}
            myIdentity={teacherIdentity}
            isTeacher={true}
            classroom={classroom}
            students={students}
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: '#666' }}>
          対局がありません。
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
