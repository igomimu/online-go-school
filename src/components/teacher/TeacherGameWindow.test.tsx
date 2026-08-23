import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveGameRow } from '../../utils/liveGameApi';
import TeacherGameWindow from './TeacherGameWindow';

const testState = vi.hoisted(() => ({
  games: [] as LiveGameRow[],
}));

vi.mock('../../hooks/useLiveGameList', () => ({
  useLiveGameList: () => ({
    games: testState.games,
    loading: false,
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

function game(id: string, status: LiveGameRow['status']): LiveGameRow {
  return {
    id,
    classroom_id: 'class-1',
    black_player: 'sid:student-a',
    white_player: 'teacher',
    board_size: 19,
    handicap: 0,
    komi: 6.5,
    status,
    result: status === 'interrupted' ? '中断' : null,
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
    expect(screen.getByText(/中断局は「一覧」から再開できます/)).toBeInTheDocument();
  });
});
