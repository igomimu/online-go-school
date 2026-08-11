import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedGame } from '../types/game';
import StudentGameHistory from './StudentGameHistory';
import { loadSavedGamesForStudent } from '../utils/savedGames';

vi.mock('../utils/savedGames', () => ({
  loadSavedGamesForStudent: vi.fn(),
}));

const game: SavedGame = {
  id: 'game-1',
  date: '2026-08-11',
  blackPlayer: 'sid:1001',
  whitePlayer: 'teacher',
  boardSize: 19,
  handicap: 0,
  komi: 6.5,
  result: 'B+R',
  sgf: '(;GM[1]SZ[19]RE[B+R])',
};

describe('StudentGameHistory', () => {
  beforeEach(() => {
    vi.mocked(loadSavedGamesForStudent).mockReset();
  });

  it('ログイン中の生徒IDで履歴を取得し、選択した棋譜を開く', async () => {
    vi.mocked(loadSavedGamesForStudent).mockResolvedValue([game]);
    const onSelectGame = vi.fn();

    render(
      <StudentGameHistory
        studentId="sid:1001"
        studentName="山田太郎"
        students={[{ id: '1001', name: '山田太郎' }]}
        onSelectGame={onSelectGame}
      />,
    );

    await waitFor(() => {
      expect(loadSavedGamesForStudent).toHaveBeenCalledWith('山田太郎', 'sid:1001');
    });
    fireEvent.click(await screen.findByRole('button', { name: /山田太郎 vs/ }));
    expect(onSelectGame).toHaveBeenCalledWith(game);
  });

  it('履歴がない場合は空の案内を表示する', async () => {
    vi.mocked(loadSavedGamesForStudent).mockResolvedValue([]);
    render(
      <StudentGameHistory
        studentId="sid:1001"
        studentName="山田太郎"
        onSelectGame={vi.fn()}
      />,
    );

    expect(await screen.findByText('保存された棋譜はまだありません。')).toBeInTheDocument();
  });
});
