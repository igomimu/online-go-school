import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import StudentTable from './StudentTable';
import { createEmptyBoard } from '../../utils/gameLogic';
import type { GameSession } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student } from '../../types/classroom';

const student: Student = {
  id: 'S001',
  studentCode: 'S001',
  name: 'たろう',
  rank: '1D',
  internalRating: '',
  type: 'ネット生',
  grade: '',
  country: '',
};

const participant: ParticipantInfo = {
  identity: 'sid:S001',
  isSpeaking: false,
  audioEnabled: true,
  videoEnabled: false,
};

const game: GameSession = {
  id: 'game-1',
  blackPlayer: 'S001',
  whitePlayer: 'teacher',
  boardSize: 9,
  handicap: 0,
  komi: 6.5,
  status: 'playing',
  boardState: createEmptyBoard(9),
  currentColor: 'BLACK',
  moveNumber: 0,
  moveHistory: [],
  blackCaptures: 0,
  whiteCaptures: 0,
};

describe('StudentTable', () => {
  it('sid付き参加者と素の生徒IDの対局を同じ生徒として表示する', () => {
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[game]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onOpenStudent={vi.fn()}
      />,
    );

    const row = screen.getByText('たろう').closest('tr');
    expect(row).not.toBeNull();
    expect(within(row!).getByText('●')).toBeInTheDocument();
    expect(within(row!).getByRole('button', { name: '開く' })).toBeEnabled();
  });

  it('同じ名前でも別IDの対局は混ぜない', () => {
    render(
      <StudentTable
        participants={[
          { identity: 'sid:1002', isSpeaking: false, audioEnabled: true, videoEnabled: false },
          { identity: 'sid:1003', isSpeaking: false, audioEnabled: true, videoEnabled: false },
        ]}
        students={[
          { ...student, id: '1002', studentCode: '1002', name: '同じ名前' },
          { ...student, id: '1003', studentCode: '1003', name: '同じ名前' },
        ]}
        games={[{ ...game, id: 'game-1002', blackPlayer: 'sid:1002', whitePlayer: 'teacher' }]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onOpenStudent={vi.fn()}
      />,
    );

    const rows = screen.getAllByText('同じ名前').map(el => el.closest('tr')!);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('●')).toBeInTheDocument();
    expect(within(rows[1]).queryByText('●')).not.toBeInTheDocument();
  });
});
