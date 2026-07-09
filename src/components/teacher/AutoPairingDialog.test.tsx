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

  it('持ち時間を項目ごとに設定するUIが表示される', () => {
    render(<AutoPairingDialog {...defaultProps} />);
    expect(screen.getByText('対局時計（全対局共通）')).toBeInTheDocument();
    expect(screen.getByText('持ち時間（分）')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'あり' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'なし' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30秒' })).toBeInTheDocument();
  });

  it('デフォルト設定（持10分・秒読30秒×3）で clock が付与される', () => {
    const onCreateGames = vi.fn();
    render(<AutoPairingDialog {...defaultProps} onCreateGames={onCreateGames} />);
    fireEvent.click(screen.getByText('1局を一括開始'));
    expect(onCreateGames).toHaveBeenCalledTimes(1);
    const pairs = onCreateGames.mock.calls[0][0];
    expect(pairs).toHaveLength(1);
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

  it('秒読み「なし」にすると秒読み0で clock が作られる', () => {
    const onCreateGames = vi.fn();
    render(<AutoPairingDialog {...defaultProps} onCreateGames={onCreateGames} />);
    fireEvent.click(screen.getByRole('button', { name: 'なし' }));
    fireEvent.click(screen.getByText('1局を一括開始'));
    const pairs = onCreateGames.mock.calls[0][0];
    expect(pairs[0].clock).toEqual(
      expect.objectContaining({ mainTimeSeconds: 600, byoyomiSeconds: 0, byoyomiPeriods: 0 })
    );
  });

  it('秒読み秒数を60秒に変更すると clock に反映される', () => {
    const onCreateGames = vi.fn();
    render(<AutoPairingDialog {...defaultProps} onCreateGames={onCreateGames} />);
    fireEvent.click(screen.getByRole('button', { name: '60秒' }));
    fireEvent.click(screen.getByText('1局を一括開始'));
    const pairs = onCreateGames.mock.calls[0][0];
    expect(pairs[0].clock).toEqual(
      expect.objectContaining({ byoyomiSeconds: 60, byoyomiPeriods: 3 })
    );
  });
});
