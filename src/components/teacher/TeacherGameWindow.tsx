import { useMemo, useState } from 'react';
import type { Student } from '../../types/classroom';
import { liveRowToSession } from '../../utils/liveGameApi';
import { deriveLiveBoardSnapshots, useLiveBoards } from '../../hooks/useLiveBoards';
import { useLiveGameList } from '../../hooks/useLiveGameList';
import GameThumbnail from '../GameThumbnail';
import GameBoard from '../GameBoard';
import { getNextTeacherTurnGameId, isTeacherParticipant, isTeacherTurn } from './simulRotation';

interface TeacherGameWindowProps {
  classroomId: string;
  teacherIdentity: string;
  students: Student[];
}

/**
 * 講師専用の対局別ウィンドウ（`?mode=game&role=TEACHER&classroomId=...`）の中身。
 * 講師が持つ全対局をこのウィンドウ単体で購読し、常に1盤だけ表示する。
 * 表示中の対局が自分の手番でなくなったら、最も待たせている手番の盤へ自動切替する。
 * 対局作成・生徒一覧はメインウィンドウ（教室ホーム画面）側の責務なのでここには持たない。
 */
export default function TeacherGameWindow({
  classroomId,
  teacherIdentity,
  students,
}: TeacherGameWindowProps) {
  const { games } = useLiveGameList(classroomId);
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

  // 表示する盤のID。選択中の盤が対局リストから消えた（終局等）/未選択の場合は
  // 手番の盤→先頭の盤へフォールバックする。
  const selectionValid = activeSimulGameId !== null && sessions.some(s => s.game.id === activeSimulGameId);
  const resolvedActiveId = selectionValid
    ? activeSimulGameId
    : (nextGameId ?? sessions[0]?.game.id ?? null);

  // フォールバックした選択はレンダー中に確定させてスティッキーにする
  // （対局追加などで games の並びが変わっても表示中の盤が入れ替わらないように）。
  // レンダー中のstate調整はReact公式パターン（effect内のsetStateは使わない）。
  if (!selectionValid && activeSimulGameId !== resolvedActiveId) {
    setActiveSimulGameId(resolvedActiveId);
  }

  // 対局の進行状態を監視するためのハッシュ（手動選択とローテーションの競合防止:
  // 実際の対局進行があったときだけ自動切替を走らせる）
  const sessionsStateHash = useMemo(() => {
    return sessions
      .map(s => `${s.game.id}:${s.game.status}:${s.snapshot.currentColor}:${s.snapshot.moveNumber}`)
      .join('|');
  }, [sessions]);

  // 自動切替（v2 切替ロジックの核心）: 対局が実際に進行した時のみ、
  // 表示中の盤が自分の手番でなければ「最も待たせている手番の盤」へ切り替える。
  const [prevStateHash, setPrevStateHash] = useState(sessionsStateHash);
  if (sessionsStateHash !== prevStateHash) {
    setPrevStateHash(sessionsStateHash);
    if (!loading) {
      const activeSession = sessions.find(s => s.game.id === resolvedActiveId);
      // 整地中 (scoring) の盤を表示している間は自動切替をスキップ (死石指定の操作中に飛ぶ事故防止)
      if (activeSession && activeSession.game.status !== 'scoring') {
        const myTurn = activeSession.game.status === 'playing' && isTeacherTurn(activeSession.game, activeSession.snapshot.currentColor, teacherIdentity);
        if (!myTurn) {
          const nextId = getNextTeacherTurnGameId(sessions, teacherIdentity);
          if (nextId && nextId !== resolvedActiveId) {
            setActiveSimulGameId(nextId);
          }
        }
      }
    }
  }

  const waitingCount = useMemo(() => {
    return sessions.filter(s => s.game.status === 'playing' && isTeacherTurn(s.game, s.snapshot.currentColor, teacherIdentity)).length;
  }, [sessions, teacherIdentity]);

  return (
    <div style={{
      height: '100%',
      background: '#d0d0c8',
      color: '#333',
      fontFamily: 'MS Gothic, "Noto Sans JP", monospace',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* 上部バー */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '4px 8px',
        borderBottom: '2px solid #999',
        background: '#e8e8e0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        </div>
      </div>

      {/* 本体コンテンツ */}
      {sessions.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: '#666' }}>
          対局がありません。教室ホーム画面から対局を作成してください。
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
      ) : resolvedActiveId ? (
        <div data-testid="simul-active-board" className="flex-1 min-h-0 bg-zinc-950 p-1 text-white overflow-hidden">
          <GameBoard
            key={resolvedActiveId}
            gameId={resolvedActiveId}
            myIdentity={teacherIdentity}
            isTeacher={true}
            students={students}
          />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, color: '#666' }}>
          対局がありません。
        </div>
      )}

    </div>
  );
}
