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
        settings={{ enabled: false, maxVisits: 1000 }}
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
        settings={{ enabled: true, maxVisits: 1000 }}
        onUpdateSettings={vi.fn()}
        boardSize={19}
      />
    );

    expect(screen.getByTestId('ai-toggle')).toHaveTextContent('ON');
    expect(screen.getByLabelText('AI解析中')).toBeInTheDocument();
  });
});
