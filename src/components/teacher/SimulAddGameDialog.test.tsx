import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type React from 'react';
import SimulAddGameDialog from './SimulAddGameDialog';
import type { Student } from '../../types/classroom';
import type { LiveGameRow } from '../../utils/liveGameApi';

const students: Student[] = [
  { id: 'a', name: '生徒A', rank: '10級', internalRating: '', type: '', grade: '', country: '', studentCode: '1001' },
  { id: 'b', name: '生徒B', rank: '8級', internalRating: '', type: '', grade: '', country: '', studentCode: '1002' },
];

function liveGame(overrides: Partial<LiveGameRow>): LiveGameRow {
  return {
    id: 'game-1',
    classroom_id: 'classroom-1',
    black_player: 'sid:a',
    white_player: 'teacher',
    board_size: 9,
    handicap: 0,
    komi: 6.5,
    status: 'playing',
    result: null,
    scoring_dead_stones: [],
    clock: null,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof SimulAddGameDialog>> = {}) {
  return render(
    <SimulAddGameDialog
      connectedIdentities={['teacher', 'sid:a', 'sid:b']}
      students={students}
      teacherIdentity="teacher"
      games={[]}
      onClose={vi.fn()}
      onCreate={vi.fn()}
      {...overrides}
    />,
  );
}

describe('SimulAddGameDialog', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('追加時に先生白・時計なしの1局だけを作成する', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onCreate });

    fireEvent.click(screen.getByText('13路'));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('追加'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate).toHaveBeenCalledWith({
      blackPlayer: 'sid:a',
      whitePlayer: 'teacher',
      boardSize: 13,
      handicap: 2,
      komi: 0.5,
      clock: null,
    });
  });

  it('先生と対局中の生徒は選択不可にする', () => {
    renderDialog({ games: [liveGame({ black_player: 'sid:a', white_player: 'teacher' })] });

    const optionA = screen.getByRole('option', { name: /生徒A.*対局中/ });
    expect(optionA).toBeDisabled();
    expect(screen.getByRole('combobox')).toHaveValue('sid:b');
  });

  it('前回追加時の盤サイズを次回デフォルトにする', async () => {
    localStorage.setItem('go-school-simul-board-size', '13');
    const onCreate = vi.fn().mockResolvedValue(undefined);
    renderDialog({ onCreate });

    fireEvent.click(screen.getByText('追加'));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ boardSize: 13 })));
  });
});
