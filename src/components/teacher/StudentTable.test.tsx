import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import StudentTable from './StudentTable';
import { createEmptyBoard } from '../../utils/gameLogic';
import type { GameSession } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomRtc';
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
  it('マイクは先生の声を届け、スピーカーは生徒の声を聞く操作にする', () => {
    const onToggleHear = vi.fn();
    const onToggleMic = vi.fn();
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[]}
        audioPermissions={{
          [participant.identity]: { canHear: true, micAllowed: false, cameraAllowed: true },
        }}
        localIdentity="teacher"
        onToggleHear={onToggleHear}
        onToggleMic={onToggleMic}
      />,
    );

    const teacherMic = screen.getByTestId(`mic-${participant.identity}`);
    const studentSpeaker = screen.getByTestId(`hear-${participant.identity}`);
    expect(teacherMic).toHaveAttribute('title', 'こちらのマイク音声が届いています（押すと止める）');
    expect(teacherMic).toHaveAttribute('aria-checked', 'true');
    expect(studentSpeaker).toHaveAttribute('title', 'この生徒の声が聞こえません（押すと聞く）');
    expect(studentSpeaker).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(teacherMic);
    fireEvent.click(studentSpeaker);
    expect(onToggleHear).toHaveBeenCalledWith(participant.identity);
    expect(onToggleMic).toHaveBeenCalledWith(participant.identity);
  });

  it('sid付き参加者と素の生徒IDの対局を同じ生徒として表示する', () => {
    const onInterruptGame = vi.fn();
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[game]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onInterruptGame={onInterruptGame}
      />,
    );

    const row = screen.getByText('たろう').closest('tr');
    expect(row).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: '対局' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '対局操作' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: '詳細' })).not.toBeInTheDocument();
    fireEvent.click(within(row!).getByRole('button', { name: '中断' }));
    expect(onInterruptGame).toHaveBeenCalledWith('game-1');
  });

  it('接続中の生徒行から、その生徒を選択して対局を作成できる', () => {
    const onCreateGame = vi.fn();
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onCreateGame={onCreateGame}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新規' }));
    expect(onCreateGame).toHaveBeenCalledWith('sid:S001');
  });

  it('進行中の生徒には作成ボタンを表示しない', () => {
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[game]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onCreateGame={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '新規' })).not.toBeInTheDocument();
  });

  it('未接続の生徒には作成ボタンを表示しない', () => {
    render(
      <StudentTable
        participants={[]}
        students={[student]}
        games={[]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onCreateGame={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '新規' })).not.toBeInTheDocument();
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
        onInterruptGame={vi.fn()}
      />,
    );

    const rows = screen.getAllByText('同じ名前').map(el => el.closest('tr')!);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByRole('button', { name: '中断' })).toBeInTheDocument();
    expect(within(rows[1]).queryByRole('button', { name: '中断' })).not.toBeInTheDocument();
  });

  it.each([
    ['中断局', { status: 'interrupted' as const, result: '中断' }],
    ['時間切れ局', { status: 'finished' as const, result: 'W+T' }],
  ])('%sには再開ボタンを表示する', (_label, gameState) => {
    const onResumeGame = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[{ ...game, ...gameState }]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onResumeGame={onResumeGame}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '再開' }));
    expect(onResumeGame).toHaveBeenCalledWith('game-1');
  });

  it('通常終局には中断・再開ボタンを表示しない', () => {
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[{ ...game, status: 'finished', result: 'B+R' }]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onInterruptGame={vi.fn()}
        onResumeGame={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: '中断' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '再開' })).not.toBeInTheDocument();
  });

  it('古い中断局が残っていても、現在進行中の対局を中断対象にする', () => {
    const onInterruptGame = vi.fn();
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[
          { ...game, id: 'old-interrupted', status: 'interrupted', result: '中断' },
          { ...game, id: 'current-playing', status: 'playing' },
        ]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onInterruptGame={onInterruptGame}
        onResumeGame={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '中断' }));
    expect(onInterruptGame).toHaveBeenCalledWith('current-playing');
    expect(screen.queryByRole('button', { name: '再開' })).not.toBeInTheDocument();
  });

  it('進行中の対局をホームから取り消せる', () => {
    const onCancelGame = vi.fn();
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[game]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onInterruptGame={vi.fn()}
        onCancelGame={onCancelGame}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancelGame).toHaveBeenCalledWith('game-1');
  });

  it('中断局には新規作成・再開・取消をすべて表示する', () => {
    const onCreateGame = vi.fn();
    const onResumeGame = vi.fn();
    const onCancelGame = vi.fn();
    render(
      <StudentTable
        participants={[participant]}
        students={[student]}
        games={[{ ...game, status: 'interrupted', result: '中断' }]}
        audioPermissions={{}}
        localIdentity="teacher"
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
        onCreateGame={onCreateGame}
        onResumeGame={onResumeGame}
        onCancelGame={onCancelGame}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新規' }));
    expect(onCreateGame).toHaveBeenCalledWith('sid:S001');
    expect(screen.getByRole('button', { name: '再開' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancelGame).toHaveBeenCalledWith('game-1');
  });

  it('ホーム画面に独立した検討列を表示し、生徒ごとにオン・オフできる', () => {
    const onToggleSharing = vi.fn();
    const props = {
      participants: [participant],
      students: [student],
      games: [],
      audioPermissions: {},
      localIdentity: 'teacher',
      onToggleHear: vi.fn(),
      onToggleMic: vi.fn(),
      onToggleSharing,
    };
    const { rerender } = render(<StudentTable {...props} sharingTargets={null} />);

    expect(screen.getByRole('columnheader', { name: '検討' })).toBeInTheDocument();
    const toggle = screen.getByTestId('share-sid:S001');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(onToggleSharing).toHaveBeenCalledWith('sid:S001');

    rerender(<StudentTable {...props} sharingTargets={[]} />);
    expect(screen.getByTestId('share-sid:S001')).toHaveAttribute('aria-checked', 'false');
  });
});
