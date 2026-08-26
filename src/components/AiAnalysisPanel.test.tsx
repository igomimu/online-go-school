import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiAnalysisPanel from './AiAnalysisPanel';

/**
 * 2026-08-26: 数字の向きが8/15の 9e1619d で黒基準へ変わってしまい、白番の局面で
 * どちらが有利なのか読めなくなっていた。三村さんが以前直したものが戻った形。
 * 表示の向きを縛って、次に触ったときすぐ気づけるようにする。
 *
 * 決まり: 勝率も目数差も手番の側から見た値。黒が10目良い局面なら、
 * 黒番では +10、白番では -10。
 */
describe('数字の向きは手番から見たもの', () => {
  const result = {
    winrate: 62.3,
    scoreLead: 10.5,
    topMoves: [{ move: 'D4', winrate: 62.3, scoreLead: 10.5, visits: 1200, pv: ['D4'] }],
  };
  const base = {
    isLoading: false,
    error: null,
    settings: { enabled: true, maxVisits: 3000, allowStudentInteraction: false },
    onUpdateSettings: vi.fn(),
    boardSize: 19,
  };

  it('黒番のときは「黒番」と手番側の勝率を出す', () => {
    render(<AiAnalysisPanel {...base} result={result} toPlay="BLACK" />);
    expect(screen.getByTestId('ai-winrate-turn')).toHaveTextContent('黒番 62.3%');
    expect(screen.getByTestId('ai-score-lead')).toHaveTextContent('+10.5目');
  });

  it('白番で白が10.5目良いときは「白番 +10.5目」', () => {
    render(<AiAnalysisPanel {...base} result={result} toPlay="WHITE" />);
    expect(screen.getByTestId('ai-winrate-turn')).toHaveTextContent('白番 62.3%');
    expect(screen.getByTestId('ai-score-lead')).toHaveTextContent('+10.5目');
  });

  it('白番で黒が10.5目良いときは -10.5目（黒基準へ裏返さない）', () => {
    render(
      <AiAnalysisPanel {...base} result={{ ...result, winrate: 37.7, scoreLead: -10.5 }} toPlay="WHITE" />
    );
    expect(screen.getByTestId('ai-winrate-turn')).toHaveTextContent('白番 37.7%');
    expect(screen.getByTestId('ai-score-lead')).toHaveTextContent('-10.5目');
    // かつて出していた B+ / W+ 表記には戻さない
    expect(screen.getByTestId('ai-score-lead')).not.toHaveTextContent('B+');
    expect(screen.getByTestId('ai-score-lead')).not.toHaveTextContent('W+');
  });

  it('目数差にはどちらから見た数字か添える', () => {
    render(<AiAnalysisPanel {...base} result={result} toPlay="WHITE" />);
    expect(screen.getByText('目数差（白番から見て）')).toBeInTheDocument();
  });
});

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
