import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveGameRow } from '../../utils/liveGameApi';
import TeacherGameWindow from './TeacherGameWindow';

const testState = vi.hoisted(() => ({
  games: [] as LiveGameRow[],
  loading: false,
}));

vi.mock('../../hooks/useLiveGameList', () => ({
  useLiveGameList: () => ({
    games: testState.games,
    loading: testState.loading,
    error: null,
    finishedGameEvent: null,
    createGame: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('../../hooks/useLiveBoards', () => ({
  useLiveBoards: (games: LiveGameRow[]) => ({
    boards: new Map(games.map(game => [game.id, {
      boardState: [],
      currentColor: 'BLACK',
      moveNumber: 0,
      lastMoveAt: null,
    }])),
    loading: false,
    error: null,
  }),
  deriveLiveBoardSnapshots: (games: LiveGameRow[]) => new Map(games.map(game => [game.id, {
    boardState: [],
    currentColor: 'BLACK',
    moveNumber: 0,
    lastMoveAt: null,
  }])),
}));

vi.mock('../GameBoard', () => ({
  default: ({ gameId }: { gameId: string }) => <div data-testid="game-board">{gameId}</div>,
}));

vi.mock('../GameThumbnail', () => ({
  default: () => <div />,
}));

vi.mock('./ClassroomAlerts', () => ({
  default: () => null,
}));

vi.mock('../../utils/teacherAlertChannel', () => ({
  subscribeTeacherAlerts: () => () => {},
}));

function game(id: string, status: LiveGameRow['status'], result?: string): LiveGameRow {
  return {
    id,
    classroom_id: 'class-1',
    black_player: 'sid:student-a',
    white_player: 'teacher',
    board_size: 19,
    handicap: 0,
    komi: 6.5,
    status,
    result: result ?? (status === 'interrupted' ? '中断' : null),
    scoring_dead_stones: [],
    clock: null,
    undo_request: null,
    created_at: '2026-08-23T00:00:00.000Z',
    updated_at: '2026-08-23T00:00:00.000Z',
  };
}

describe('TeacherGameWindow の新規対局表示', () => {
  beforeEach(() => {
    testState.games = [];
    testState.loading = false;
  });

  it('新規局を初手前に表示し、終局後は古い中断局へ戻らない', () => {
    const oldInterrupted = game('old-interrupted', 'interrupted');
    testState.games = [oldInterrupted];
    const view = render(
      <TeacherGameWindow classroomId="class-1" teacherIdentity="teacher" students={[]} />,
    );

    expect(screen.queryByTestId('game-board')).not.toBeInTheDocument();
    expect(screen.getByText(/進行中の対局がありません/)).toBeInTheDocument();

    const newPlaying = game('new-playing', 'playing');
    testState.games = [newPlaying, oldInterrupted];
    view.rerender(
      <TeacherGameWindow classroomId="class-1" teacherIdentity="teacher" students={[]} />,
    );

    expect(screen.getByTestId('game-board')).toHaveTextContent('new-playing');

    testState.games = [oldInterrupted];
    view.rerender(
      <TeacherGameWindow classroomId="class-1" teacherIdentity="teacher" students={[]} />,
    );

    expect(screen.queryByTestId('game-board')).not.toBeInTheDocument();
    expect(screen.getByText(/中断した対局は、生徒一覧の「棋譜履歴」から再開できます/)).toBeInTheDocument();
  });

  it('Realtime INSERTを取り逃してもURLで渡された新規IDを初手前に表示する', () => {
    const oldInterrupted = game('old-interrupted', 'interrupted');
    testState.games = [oldInterrupted];
    testState.loading = true;
    const view = render(
      <TeacherGameWindow
        classroomId="class-1"
        teacherIdentity="teacher"
        students={[]}
        initialGameId="new-playing"
      />,
    );

    expect(screen.getByTestId('game-board')).toHaveTextContent('new-playing');

    testState.loading = false;
    testState.games = [game('new-playing', 'playing'), oldInterrupted];
    view.rerender(
      <TeacherGameWindow
        classroomId="class-1"
        teacherIdentity="teacher"
        students={[]}
        initialGameId="new-playing"
      />,
    );

    expect(screen.getByTestId('game-board')).toHaveTextContent('new-playing');
  });

  // 2026-09-05 三村さん「盤は残してほしい」。1面だけ打っていて時間切れになると、
  // 次の盤が無いのに今の盤を手放し、結果も再開ボタンも消えていた。
  it('1面だけのときは時間切れになってもその盤を表示したままにする', () => {
    const playing = game('timeout-game', 'playing');
    testState.games = [playing];
    const view = render(
      <TeacherGameWindow classroomId="class-1" teacherIdentity="teacher" students={[]} />,
    );
    expect(screen.getByTestId('game-board')).toHaveTextContent('timeout-game');

    testState.games = [game('timeout-game', 'finished', 'W+T')];
    view.rerender(
      <TeacherGameWindow classroomId="class-1" teacherIdentity="teacher" students={[]} />,
    );

    expect(screen.getByTestId('game-board')).toHaveTextContent('timeout-game');
    expect(screen.queryByText(/進行中の対局がありません/)).not.toBeInTheDocument();
  });

  it('他に打っている盤があれば、時間切れの盤からそちらへ移る', () => {
    testState.games = [game('timeout-game', 'playing')];
    const view = render(
      <TeacherGameWindow classroomId="class-1" teacherIdentity="teacher" students={[]} />,
    );
    expect(screen.getByTestId('game-board')).toHaveTextContent('timeout-game');

    testState.games = [game('timeout-game', 'finished', 'W+T'), game('other-playing', 'playing')];
    view.rerender(
      <TeacherGameWindow classroomId="class-1" teacherIdentity="teacher" students={[]} />,
    );

    expect(screen.getByTestId('game-board')).toHaveTextContent('other-playing');
  });
});
