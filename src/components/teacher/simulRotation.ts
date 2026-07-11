// 多面打ちの手番判定・次盤選定ロジック（純関数）。
// SimulGrid から分離しているのは react-refresh/only-export-components 対応
// （コンポーネントファイルから関数を export しない）。

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

export function isTeacherParticipant(
  game: { black_player: string; white_player: string },
  teacherIdentity: string,
): boolean {
  return game.black_player === teacherIdentity || game.white_player === teacherIdentity;
}

export function isTeacherTurn(
  game: { black_player: string; white_player: string },
  currentColor: 'BLACK' | 'WHITE',
  teacherIdentity: string,
): boolean {
  if (game.black_player === teacherIdentity) return currentColor === 'BLACK';
  if (game.white_player === teacherIdentity) return currentColor === 'WHITE';
  return false;
}

/** 自分の手番の盤のうち、最も長く待たせている（最終着手が最も古い）盤のIDを返す */
export function getNextTeacherTurnGameId(
  sessions: GameSessionInfo[],
  teacherIdentity: string,
): string | null {
  const waiting = sessions
    .filter(({ game, snapshot }) =>
      game.status === 'playing' &&
      isTeacherTurn(game, snapshot.currentColor, teacherIdentity),
    )
    .sort((a, b) => {
      const aTime = a.snapshot.lastMoveAt ? Date.parse(a.snapshot.lastMoveAt) : 0;
      const bTime = b.snapshot.lastMoveAt ? Date.parse(b.snapshot.lastMoveAt) : 0;
      return aTime - bTime;
    });
  return waiting[0]?.game.id ?? null;
}
