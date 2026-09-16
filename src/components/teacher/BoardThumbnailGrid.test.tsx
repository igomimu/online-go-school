import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BoardThumbnailGrid from './BoardThumbnailGrid';
import { createEmptyBoard } from '../../utils/gameLogic';
import type { GameSession } from '../../types/game';

const student = {
  id: '1001',
  studentCode: '1001',
  name: 'たろう',
  rank: '1D',
  internalRating: '',
  type: 'ネット生',
  grade: '',
  country: '',
};

const student2 = {
  ...student,
  id: '1002',
  studentCode: '1002',
  name: 'はなこ',
  rank: '3K',
};

const game = (
  id: string,
  status: GameSession['status'],
  players: { black: string; white: string } = { black: 'sid:1001', white: 'teacher' },
): GameSession => ({
  id,
  blackPlayer: players.black,
  whitePlayer: players.white,
  boardSize: 9,
  handicap: 0,
  komi: 6.5,
  status,
  boardState: createEmptyBoard(9),
  currentColor: 'BLACK',
  moveNumber: 0,
  moveHistory: [],
  blackCaptures: 0,
  whiteCaptures: 0,
  result: status === 'interrupted' ? '中断' : undefined,
});

/** 生徒の識別子から盤を引く（本番のE2Eヘルパーと同じ引き方） */
const boardOf = (studentId: string) =>
  document.querySelectorAll(`[data-board-students~="${studentId}"]`);

describe('BoardThumbnailGrid', () => {
  it('中断局だけなら進行中の碁盤を表示しない', () => {
    render(
      <BoardThumbnailGrid
        games={[game('old', 'interrupted')]}
        students={[student]}
        onSelectGame={vi.fn()}
      />,
    );
    expect(boardOf('1001')).toHaveLength(0);
    expect(screen.getByText('進行中の対局はありません')).toBeInTheDocument();
  });

  it('中断局の後に新規対局があれば新しい碁盤を開く', () => {
    const onSelectGame = vi.fn();
    render(
      <BoardThumbnailGrid
        games={[game('old', 'interrupted'), game('new', 'playing')]}
        students={[student]}
        onSelectGame={onSelectGame}
      />,
    );
    fireEvent.click(screen.getByTestId('open-board-new'));
    expect(onSelectGame).toHaveBeenCalledWith('new');
  });

  it('生徒同士の対局でも碁盤は1つだけ出す', () => {
    render(
      <BoardThumbnailGrid
        games={[game('g1', 'playing', { black: 'sid:1001', white: 'sid:1002' })]}
        students={[student, student2]}
        onSelectGame={vi.fn()}
      />,
    );
    // 1局＝1枠。両方の生徒からその1枠を引ける
    expect(screen.getAllByTestId(/^open-board-/)).toHaveLength(1);
    expect(boardOf('1001')).toHaveLength(1);
    expect(boardOf('1002')).toHaveLength(1);
    expect(screen.getByText('たろう')).toBeInTheDocument();
    expect(screen.getByText('はなこ')).toBeInTheDocument();
  });

  it('対局していない生徒の空枠は作らない', () => {
    render(
      <BoardThumbnailGrid
        games={[game('g1', 'playing')]}
        students={[student, student2]}
        onSelectGame={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId(/^open-board-/)).toHaveLength(1);
    expect(boardOf('1002')).toHaveLength(0);
  });
});
