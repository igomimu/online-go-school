import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MoveCounter from './MoveCounter';

describe('MoveCounter', () => {
  it('手数を表示する', () => {
    render(<MoveCounter currentMove={42} totalMoves={250} />);
    expect(screen.getByText('42 / 250')).toBeInTheDocument();
  });

  it('0手目を表示する', () => {
    render(<MoveCounter currentMove={0} totalMoves={0} />);
    expect(screen.getByText('0 / 0')).toBeInTheDocument();
  });
});
