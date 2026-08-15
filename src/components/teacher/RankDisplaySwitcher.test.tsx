import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RankDisplaySwitcher from './RankDisplaySwitcher';

describe('RankDisplaySwitcher', () => {
  it('現在の棋力表示を示し、授業中にランクへ切り替えられる', () => {
    const onChange = vi.fn();
    render(<RankDisplaySwitcher value="dan_kyu" onChange={onChange} />);

    expect(screen.getByTestId('rank-display-dan_kyu')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('rank-display-rating')).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByTestId('rank-display-rating'));
    expect(onChange).toHaveBeenCalledWith('rating');
  });

  it('保存中は連続操作できない', () => {
    const onChange = vi.fn();
    render(
      <RankDisplaySwitcher
        value="rating"
        disabled
        message="保存中…"
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByTestId('rank-display-dan_kyu'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('保存中…');
  });
});
