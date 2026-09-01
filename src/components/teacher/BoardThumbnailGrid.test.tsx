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

const game = (id: string, status: GameSession['status']): GameSession => ({
  id,
  blackPlayer: 'sid:1001',
  whitePlayer: 'teacher',
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
describe('BoardThumbnailGrid', () => {
  it('中断局だけなら進行中の碁盤を表示しない', () => {
    render(
      <BoardThumbnailGrid
        games={[game('old', 'interrupted')]}
        students={[student]}
        participants={[]}
        onSelectGame={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('open-board-1001')).not.toBeInTheDocument();
  });

  it('中断局の後に新規対局があれば新しい碁盤を開く', () => {
    const onSelectGame = vi.fn();
    render(
      <BoardThumbnailGrid
        games={[game('old', 'interrupted'), game('new', 'playing')]}
        students={[student]}
        participants={[]}
        onSelectGame={onSelectGame}
      />,
    );
    fireEvent.click(screen.getByTestId('open-board-1001'));
    expect(onSelectGame).toHaveBeenCalledWith('new');
  });
});
