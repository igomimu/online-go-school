import { identityMatchesPlayer } from '../../utils/identityUtils';

// 多面打ちの手番判定・次盤選定ロジック（純関数）。
// TeacherGameWindow から分離しているのは react-refresh/only-export-components 対応
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
  return identityMatchesPlayer(teacherIdentity, game.black_player) || identityMatchesPlayer(teacherIdentity, game.white_player);
}

export function isTeacherTurn(
  game: { black_player: string; white_player: string },
  currentColor: 'BLACK' | 'WHITE',
  teacherIdentity: string,
): boolean {
  if (identityMatchesPlayer(teacherIdentity, game.black_player)) return currentColor === 'BLACK';
  if (identityMatchesPlayer(teacherIdentity, game.white_player)) return currentColor === 'WHITE';
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

/** 一覧へ新しく加わった進行中の盤を返す。sessions は新しい対局が先の並び。 */
export function getNewActiveGameId(
  sessions: GameSessionInfo[],
  previousGameIds: ReadonlySet<string>,
): string | null {
  return sessions.find(({ game }) =>
    !previousGameIds.has(game.id) && (game.status === 'playing' || game.status === 'scoring'),
  )?.game.id ?? null;
}

/** 自動表示に使う盤。中断・終局盤は一覧から明示的に選んだ場合だけ表示する。 */
export function getDefaultActiveGameId(
  sessions: GameSessionInfo[],
  teacherIdentity: string,
): string | null {
  return getNextTeacherTurnGameId(sessions, teacherIdentity)
    ?? sessions.find(({ game }) => game.status === 'playing' || game.status === 'scoring')?.game.id
    ?? null;
}
