export const TEACHER_GAME_WINDOW_NAME = 'teacher-game-window';

export function buildTeacherGameWindowUrl(
  origin: string,
  pathname: string,
  classroomId: string,
  identity: string,
  gameId?: string,
): string {
  const params = new URLSearchParams({
    mode: 'game',
    role: 'TEACHER',
    teacherClassroomId: classroomId,
    identity,
  });
  if (gameId) params.set('teacherGameId', gameId);
  return `${origin}${pathname}?${params.toString()}`;
}

export interface TeacherGameWindowTarget {
  location: { replace: (url: string) => void };
  focus: () => void;
}

/** 作成後の確定ID付きURLへ講師窓を切り替える。 */
export function showCreatedGameInTeacherWindow(
  target: TeacherGameWindowTarget,
  url: string,
): void {
  target.location.replace(url);
  target.focus();
}
