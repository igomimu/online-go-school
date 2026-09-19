import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import TsumegoPickerDialog from './TsumegoPickerDialog';

vi.mock('../../utils/tsumegoApi', () => ({
  fetchRandomTsumegoProblem: vi.fn(async () => ({ id: 'row-1' })),
}));
vi.mock('../../utils/tsumegoConvert', () => ({
  tsumegoRowToProblem: () => ({
    id: 'p1',
    title: 'テスト詰碁',
    boardSize: 9,
    initialBoard: Array.from({ length: 9 }, () => Array(9).fill(null)),
    correctColor: 'BLACK',
  }),
}));
vi.mock('../GoBoard', () => ({ default: () => <div data-testid="board" /> }));

const recipients = [
  { identity: 'sid:1', name: '一郎' },
  { identity: 'sid:2', name: '二郎', playing: true },
  { identity: 'sid:3', name: '三郎' },
];

async function drawOne() {
  fireEvent.click(screen.getByRole('button', { name: /ランダムに1問取得/ }));
  await screen.findByText('テスト詰碁');
}

describe('TsumegoPickerDialog の出題先', () => {
  it('誰も外さなければ全員（null）で出題する', async () => {
    const onAssign = vi.fn();
    render(<TsumegoPickerDialog onAssign={onAssign} onClose={() => {}} recipients={recipients} />);
    await drawOne();
    fireEvent.click(screen.getByRole('button', { name: /この問題を出題（3名）/ }));
    expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), null);
  });

  it('外した生徒には出題しない', async () => {
    const onAssign = vi.fn();
    render(<TsumegoPickerDialog onAssign={onAssign} onClose={() => {}} recipients={recipients} />);
    expect(screen.getByText('・対局中')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('tsumego-recipient-sid:2'));
    await drawOne();
    fireEvent.click(screen.getByRole('button', { name: /この問題を出題（2名）/ }));
    expect(onAssign).toHaveBeenCalledWith(expect.anything(), ['sid:1', 'sid:3']);
  });

  it('全員外したら出題できない', async () => {
    const onAssign = vi.fn();
    render(<TsumegoPickerDialog onAssign={onAssign} onClose={() => {}} recipients={recipients} />);
    recipients.forEach(r => fireEvent.click(screen.getByTestId(`tsumego-recipient-${r.identity}`)));
    await drawOne();
    const button = screen.getByRole('button', { name: /この問題を出題（0名）/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAssign).not.toHaveBeenCalled();
  });

  it('検討盤から開くとき（recipients なし）は選択欄を出さない', async () => {
    const onAssign = vi.fn();
    render(<TsumegoPickerDialog onAssign={onAssign} onClose={() => {}} />);
    expect(screen.queryByText(/出題する生徒/)).toBeNull();
    await drawOne();
    fireEvent.click(screen.getByRole('button', { name: 'この問題を配信' }));
    expect(onAssign).toHaveBeenCalledWith(expect.anything(), null);
  });
});
