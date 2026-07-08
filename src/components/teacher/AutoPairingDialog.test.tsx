import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AutoPairingDialog from './AutoPairingDialog';
import type { Student } from '../../types/classroom';

const makeStudent = (id: string, name: string, rank: string): Student => ({
  id,
  name,
  rank,
  internalRating: '',
  type: 'ネット生',
  grade: '小4',
  country: '日本',
});

describe('AutoPairingDialog', () => {
  const students = [
    makeStudent('s1', 'たろう', '1D'),
    makeStudent('s2', 'はなこ', '3K'),
  ];
  const defaultProps = {
    connectedIdentities: ['sid:s1', 'sid:s2', 'teacher'],
    students,
    teacherIdentity: 'teacher',
    onClose: vi.fn(),
    onCreateGames: vi.fn(),
  };

  it('対局時計セレクトが表示される', () => {
    render(<AutoPairingDialog {...defaultProps} />);
    expect(screen.getByText('対局時計')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '時間無制限' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '持10分 秒読30秒×3' })).toBeInTheDocument();
  });

  it('デフォルト（時間無制限）では clock なしで onCreateGames が呼ばれる', () => {
    const onCreateGames = vi.fn();
    render(<AutoPairingDialog {...defaultProps} onCreateGames={onCreateGames} />);
    fireEvent.click(screen.getByText('1局を一括開始'));
    expect(onCreateGames).toHaveBeenCalledTimes(1);
    const pairs = onCreateGames.mock.calls[0][0];
    expect(pairs).toHaveLength(1);
    expect(pairs[0].clock).toBeUndefined();
  });

  it('時計プリセット選択で全ペアに clock が付与される', () => {
    const onCreateGames = vi.fn();
    render(<AutoPairingDialog {...defaultProps} onCreateGames={onCreateGames} />);
    // 「持10分 秒読30秒×3」= CLOCK_PRESETS index 2
    const select = screen.getByRole('option', { name: '時間無制限' }).closest('select')!;
    fireEvent.change(select, { target: { value: '2' } });
    fireEvent.click(screen.getByText('1局を一括開始'));
    const pairs = onCreateGames.mock.calls[0][0];
    expect(pairs[0].clock).toEqual(
      expect.objectContaining({
        mainTimeSeconds: 600,
        byoyomiSeconds: 30,
        byoyomiPeriods: 3,
        blackTimeLeft: 600,
        whiteTimeLeft: 600,
        lastTickTime: null,
      })
    );
  });
});
