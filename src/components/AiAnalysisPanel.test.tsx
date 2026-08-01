import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiAnalysisPanel from './AiAnalysisPanel';

describe('AiAnalysisPanel', () => {
  it('OFF表示は現在の停止状態を表し、スピナーを表示しない', () => {
    const onUpdateSettings = vi.fn();
    render(
      <AiAnalysisPanel
        result={null}
        isLoading={true}
        error={null}
        settings={{ enabled: false, maxVisits: 1000, allowStudentInteraction: false }}
        onUpdateSettings={onUpdateSettings}
        boardSize={19}
      />
    );

    expect(screen.getByTestId('ai-toggle')).toHaveTextContent('OFF');
    expect(screen.queryByLabelText('AI解析中')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ai-toggle'));
    expect(onUpdateSettings).toHaveBeenCalledWith({ enabled: true });
  });

  it('ONかつ解析中の時だけスピナーを表示する', () => {
    render(
      <AiAnalysisPanel
        result={null}
        isLoading={true}
        error={null}
        settings={{ enabled: true, maxVisits: 1000, allowStudentInteraction: false }}
        onUpdateSettings={vi.fn()}
        boardSize={19}
      />
    );

    expect(screen.getByTestId('ai-toggle')).toHaveTextContent('ON');
    expect(screen.getByLabelText('AI解析中')).toBeInTheDocument();
  });

  it('生徒用パネルでは候補手を操作できない', () => {
    const onCandidateHover = vi.fn();
    const onHighlightMove = vi.fn();
    render(
      <AiAnalysisPanel
        result={{
          winrate: 60,
          scoreLead: 3,
          topMoves: [{ move: 'D4', winrate: 60, scoreLead: 3, visits: 1200, pv: ['D4'] }],
        }}
        isLoading={false}
        error={null}
        settings={{ enabled: true, maxVisits: 3000, allowStudentInteraction: false }}
        onUpdateSettings={vi.fn()}
        onCandidateHover={onCandidateHover}
        onHighlightMove={onHighlightMove}
        boardSize={19}
        readOnly
      />
    );

    const move = screen.getByTestId('ai-move-0');
    fireEvent.mouseEnter(move);
    fireEvent.click(move);
    expect(onCandidateHover).not.toHaveBeenCalled();
    expect(onHighlightMove).not.toHaveBeenCalled();
  });

  it('講師は生徒の候補手操作をオプションで許可できる', () => {
    const onUpdateSettings = vi.fn();
    render(
      <AiAnalysisPanel
        result={null}
        isLoading={false}
        error={null}
        settings={{ enabled: true, maxVisits: 3000, allowStudentInteraction: false }}
        onUpdateSettings={onUpdateSettings}
        boardSize={19}
      />
    );

    fireEvent.click(screen.getByText('設定'));
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onUpdateSettings).toHaveBeenCalledWith({ allowStudentInteraction: true });
  });
});
