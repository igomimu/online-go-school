import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import ProblemBoard from './ProblemBoard';
import type { Problem } from '../types/problem';
import { createEmptyBoard } from '../utils/gameLogic';

const fetchRandom = vi.fn();
vi.mock('../utils/tsumegoApi', () => ({
  fetchRandomTsumegoProblem: (...args: unknown[]) => fetchRandom(...args),
}));
vi.mock('../utils/tsumegoConvert', () => ({
  tsumegoRowToProblem: (row: { id: string }) => makeProblem(row.id),
}));
// 盤は交点を押すボタンだけに置き換える（(1,1)=正解 / (2,2)=不正解）
vi.mock('./GoBoard', () => ({
  default: ({ onCellClick }: { onCellClick?: (x: number, y: number) => void }) => (
    <div>
      <button onClick={() => onCellClick?.(1, 1)}>正解の手</button>
      <button onClick={() => onCellClick?.(2, 2)}>まちがいの手</button>
    </div>
  ),
}));
vi.mock('./TsumegoReportModal', () => ({ default: () => null }));

function makeProblem(id: string, lives?: number, timeLimitSec?: number): Problem {
  return {
    id,
    title: `問題${id}`,
    boardSize: 9,
    initialBoard: createEmptyBoard(9),
    correctColor: 'BLACK',
    sgfTree: { children: [{ move: { x: 1, y: 1, color: 'BLACK' }, children: [] }] },
    difficulty: '5K+',
    createdAt: '',
    lives,
    timeLimitSec,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchRandom.mockReset();
  fetchRandom.mockResolvedValue({ id: 'next' });
});
afterEach(() => vi.useRealTimers());

describe('ProblemBoard のライフと次の問題', () => {
  it('まちがえるとライフが減り、残っていればやり直せる', () => {
    const onResult = vi.fn();
    render(<ProblemBoard problem={makeProblem('a', 2)} onBack={() => {}} onResult={onResult} />);
    fireEvent.click(screen.getByText('まちがいの手'));
    expect(onResult).toHaveBeenLastCalledWith('incorrect', 1, expect.objectContaining({ attempt: 1, livesLeft: 1 }));
    expect(screen.getByLabelText('ライフ 残り1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /やり直し/ }));
    fireEvent.click(screen.getByText('正解の手'));
    expect(onResult).toHaveBeenLastCalledWith('correct', 1, expect.objectContaining({ attempt: 2, livesLeft: 1, solved: 1 }));
  });

  it('ライフが尽きたらやり直せず、同じレベルの次の問題へ進む', async () => {
    const onResult = vi.fn();
    render(<ProblemBoard problem={makeProblem('a', 1)} onBack={() => {}} onResult={onResult} />);
    fireEvent.click(screen.getByText('まちがいの手'));
    expect(screen.getByText('ライフがなくなりました')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /やり直し/ })).toBeNull();
    expect(onResult).toHaveBeenLastCalledWith('incorrect', 1, expect.objectContaining({ livesLeft: 0, failed: 1 }));

    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    // 「5K+」は「5K」として引く。盤サイズも同じ
    expect(fetchRandom).toHaveBeenCalledWith({ level: '5K', boardSize: 9 });
    expect(screen.getByText('問題next')).toBeInTheDocument();
    expect(screen.getByTestId('problem-number')).toHaveTextContent('2問目');
    // 次の問題ではライフが満タンに戻る
    expect(screen.getByLabelText('ライフ 残り1')).toBeInTheDocument();
  });

  it('解けたら次の問題へ進む', async () => {
    render(<ProblemBoard problem={makeProblem('a', 3)} onBack={() => {}} />);
    fireEvent.click(screen.getByText('正解の手'));
    expect(screen.queryByRole('button', { name: /やり直し/ })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    expect(screen.getByText('問題next')).toBeInTheDocument();
  });

  it('ライフなし（検討などの従来の出題）は次へ進まず、何度でもやり直せる', async () => {
    render(<ProblemBoard problem={makeProblem('a')} onBack={() => {}} />);
    fireEvent.click(screen.getByText('まちがいの手'));
    fireEvent.click(screen.getByRole('button', { name: /やり直し/ }));
    fireEvent.click(screen.getByText('まちがいの手'));
    expect(screen.getByRole('button', { name: /やり直し/ })).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchRandom).not.toHaveBeenCalled();
  });

  it('制限時間が切れたらライフを減らさず失敗にし、次の問題へ進む', async () => {
    const onResult = vi.fn();
    render(<ProblemBoard problem={makeProblem('a', 3, 60)} onBack={() => {}} onResult={onResult} />);
    expect(screen.getByTestId('problem-timer')).toHaveTextContent('1:00');

    // 1回まちがえてからやり直し中に時間切れ。やり直しても時計は戻らない
    fireEvent.click(screen.getByText('まちがいの手'));
    fireEvent.click(screen.getByRole('button', { name: /やり直し/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(50_000); });
    expect(screen.getByTestId('problem-timer')).toHaveTextContent('0:10');
    await act(async () => { await vi.advanceTimersByTimeAsync(10_500); });

    expect(screen.getAllByText('時間切れ').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /やり直し/ })).toBeNull();
    expect(onResult).toHaveBeenLastCalledWith('incorrect', 0, expect.objectContaining({ timedOut: true, livesLeft: 2, failed: 1 }));

    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    expect(screen.getByText('問題next')).toBeInTheDocument();
    // 次の問題は時計もライフも満タンから
    expect(screen.getByTestId('problem-timer')).toHaveTextContent('1:00');
    expect(screen.getByLabelText('ライフ 残り3')).toBeInTheDocument();
  });

  it('制限時間なしならタイマーを出さない', () => {
    render(<ProblemBoard problem={makeProblem('a', 3)} onBack={() => {}} />);
    expect(screen.queryByTestId('problem-timer')).toBeNull();
  });
});
