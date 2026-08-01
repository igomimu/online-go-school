import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GameThumbnail from './GameThumbnail';
import { createEmptyBoard } from '../utils/gameLogic';
import type { GameSession } from '../types/game';
import { setTeacherDisplayName } from '../utils/identityUtils';

function createMockGame(overrides: Partial<GameSession> = {}): GameSession {
  return {
    id: 'game-1',
    blackPlayer: 'たろう',
    whitePlayer: 'はなこ',
    boardSize: 9,
    handicap: 0,
    komi: 6.5,
    status: 'playing',
    boardState: createEmptyBoard(9),
    currentColor: 'BLACK',
    moveNumber: 10,
    moveHistory: [],
    blackCaptures: 0,
    whiteCaptures: 0,
    ...overrides,
  };
}

describe('GameThumbnail', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('対局者名を表示する', () => {
    render(<GameThumbnail game={createMockGame()} onClick={vi.fn()} />);
    expect(screen.getByText('たろう')).toBeInTheDocument();
    expect(screen.getByText('はなこ')).toBeInTheDocument();
  });

  it('講師identityはteacherではなく講師名で表示する', () => {
    setTeacherDisplayName('三村智保 九段');
    render(<GameThumbnail game={createMockGame({ whitePlayer: 'teacher' })} onClick={vi.fn()} />);
    expect(screen.getByText('三村智保 九段')).toBeInTheDocument();
    expect(screen.queryByText('teacher')).not.toBeInTheDocument();
  });

  it('進行中は手数を表示', () => {
    render(<GameThumbnail game={createMockGame()} onClick={vi.fn()} />);
    expect(screen.getByText('10手目')).toBeInTheDocument();
  });

  it('終局は結果を表示', () => {
    const game = createMockGame({ status: 'finished', result: 'W+2.5' });
    render(<GameThumbnail game={game} onClick={vi.fn()} />);
    expect(screen.getByText('W+2.5')).toBeInTheDocument();
  });

  it('中断対局は再開ボタンを表示する', () => {
    const onResume = vi.fn();
    const game = createMockGame({ status: 'interrupted', result: '中断' });
    render(<GameThumbnail game={game} onClick={vi.fn()} onResume={onResume} />);

    fireEvent.click(screen.getByText('再開'));
    expect(screen.getByText('中断')).toBeInTheDocument();
    expect(onResume).toHaveBeenCalledWith('game-1');
  });

  it('時間切れ終局は講師のみ再開ボタンを表示する（生徒には出さない）', () => {
    const onResume = vi.fn();
    const game = createMockGame({ status: 'finished', result: 'W+T' });

    const { rerender } = render(<GameThumbnail game={game} onClick={vi.fn()} onResume={onResume} />);
    expect(screen.getByText('時間切れ')).toBeInTheDocument();
    expect(screen.queryByText('再開')).not.toBeInTheDocument();

    rerender(<GameThumbnail game={game} onClick={vi.fn()} onResume={onResume} allowTimeoutResume />);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('再開'));
    expect(onResume).toHaveBeenCalledWith('game-1');
  });

  it('時間切れ以外の終局は講師でも再開ボタンを出さない', () => {
    const game = createMockGame({ status: 'finished', result: 'B+R' });
    render(<GameThumbnail game={game} onClick={vi.fn()} onResume={vi.fn()} allowTimeoutResume />);
    expect(screen.queryByText('再開')).not.toBeInTheDocument();
  });

  it('再開確認をキャンセルしたら再開しない', () => {
    const onResume = vi.fn();
    const game = createMockGame({ status: 'finished', result: 'W+T' });
    render(<GameThumbnail game={game} onClick={vi.fn()} onResume={onResume} allowTimeoutResume />);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByText('再開'));
    expect(onResume).not.toHaveBeenCalled();
  });

  it('クリックでonClickが呼ばれる', () => {
    const onClick = vi.fn();
    render(<GameThumbnail game={createMockGame()} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalled();
  });

  it('アクティブ時にリングスタイルが付く', () => {
    const { container } = render(
      <GameThumbnail game={createMockGame()} onClick={vi.fn()} isActive={true} />
    );
    const button = container.querySelector('[class*="ring-2"]');
    expect(button).toBeInTheDocument();
  });
});
