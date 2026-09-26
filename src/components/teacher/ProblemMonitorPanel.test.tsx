import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import ProblemMonitorPanel from './ProblemMonitorPanel';
import type { Problem, ProblemPreview } from '../../types/problem';
import { createEmptyBoard } from '../../utils/gameLogic';

// 盤は何を映しているかだけ分かればよい
vi.mock('../GoBoard', () => ({
  default: ({ boardSize }: { boardSize: number }) => <div data-testid="monitor-board">{boardSize}路</div>,
}));

const assigned: Problem = {
  id: 'p1', title: '出題1', boardSize: 9, initialBoard: createEmptyBoard(9),
  correctColor: 'BLACK', sgfTree: { children: [] }, createdAt: '',
};
const third: ProblemPreview = { id: 'p3', title: '3問目の問題', boardSize: 13, initialBoard: createEmptyBoard(13) };

describe('ProblemMonitorPanel', () => {
  it('生徒を押すと、その生徒がいま解いている問題を映す', () => {
    render(
      <ProblemMonitorPanel
        problem={assigned}
        students={[]}
        participants={[
          { identity: 'teacher', name: '先生' } as never,
          { identity: 'sid:1', name: '太郎' } as never,
        ]}
        results={{ 'sid:1': { result: null, moveCount: 0, problemNo: 3, solved: 2, failed: 0, current: third } }}
        localIdentity="teacher"
        onBack={() => {}}
      />,
    );
    // 既定は出題した問題
    expect(screen.getByTestId('monitor-board')).toHaveTextContent('9路');
    // 次の問題へ進んだ生徒は、前の結果でなく「挑戦中」と今の問題番号
    expect(screen.getByTestId('problem-monitor-progress')).toHaveTextContent('3問目・正解2');
    expect(screen.getByTestId('problem-monitor-status')).toHaveTextContent('挑戦中');

    fireEvent.click(screen.getByTestId('problem-monitor-row'));
    expect(screen.getByTestId('monitor-board')).toHaveTextContent('13路');
    expect(screen.getByTestId('problem-monitor-shown')).toHaveTextContent('太郎が解いている3問目（3問目の問題）');

    fireEvent.click(screen.getByText('出題した問題に戻す'));
    expect(screen.getByTestId('monitor-board')).toHaveTextContent('9路');
  });
});
