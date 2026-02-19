import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GameBoard from './GameBoard';
import { createEmptyBoard } from '../utils/gameLogic';
import type { GameSession } from '../types/game';

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
    moveNumber: 0,
    moveHistory: [],
    blackCaptures: 0,
    whiteCaptures: 0,
    ...overrides,
  };
}

describe('GameBoard', () => {
  it('対局情報を表示する', () => {
    const game = createMockGame();
    render(
      <GameBoard
        game={game}
        myIdentity="たろう"
        onMove={vi.fn()}
        onPass={vi.fn()}
        onResign={vi.fn()}
      />
    );
    expect(screen.getByText('たろう')).toBeInTheDocument();
    expect(screen.getByText('はなこ')).toBeInTheDocument();
    expect(screen.getByText('0手目')).toBeInTheDocument();
  });

  it('自分の番のとき「あなたの番です」を表示', () => {
    const game = createMockGame({ currentColor: 'BLACK' });
    render(
      <GameBoard
        game={game}
        myIdentity="たろう"
        onMove={vi.fn()}
        onPass={vi.fn()}
        onResign={vi.fn()}
      />
    );
    expect(screen.getByText('あなたの番です')).toBeInTheDocument();
  });

  it('相手の番のとき「相手の番です」を表示', () => {
    const game = createMockGame({ currentColor: 'WHITE' });
    render(
      <GameBoard
        game={game}
        myIdentity="たろう"
        onMove={vi.fn()}
        onPass={vi.fn()}
        onResign={vi.fn()}
      />
    );
    expect(screen.getByText('相手の番です')).toBeInTheDocument();
  });

  it('パスボタンが自分の番のとき表示される', () => {
    const game = createMockGame({ currentColor: 'BLACK' });
    const onPass = vi.fn();
    render(
      <GameBoard
        game={game}
        myIdentity="たろう"
        onMove={vi.fn()}
        onPass={onPass}
        onResign={vi.fn()}
      />
    );
    const passBtn = screen.getByText('パス');
    expect(passBtn).toBeInTheDocument();
    fireEvent.click(passBtn);
    expect(onPass).toHaveBeenCalledWith('game-1', 'BLACK');
  });

  it('投了ボタンをクリック→confirmで呼ばれる', () => {
    const game = createMockGame({ currentColor: 'BLACK' });
    const onResign = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <GameBoard
        game={game}
        myIdentity="たろう"
        onMove={vi.fn()}
        onPass={vi.fn()}
        onResign={onResign}
      />
    );
    fireEvent.click(screen.getByText('投了'));
    expect(onResign).toHaveBeenCalledWith('game-1', 'BLACK');
    vi.restoreAllMocks();
  });

  it('終局時は結果を表示しボタンは非表示', () => {
    const game = createMockGame({ status: 'finished', result: 'B+R' });
    render(
      <GameBoard
        game={game}
        myIdentity="たろう"
        onMove={vi.fn()}
        onPass={vi.fn()}
        onResign={vi.fn()}
      />
    );
    expect(screen.getByText('終局: B+R')).toBeInTheDocument();
    expect(screen.queryByText('パス')).not.toBeInTheDocument();
    expect(screen.queryByText('投了')).not.toBeInTheDocument();
  });

  it('戻るボタンが機能する', () => {
    const game = createMockGame();
    const onBack = vi.fn();
    render(
      <GameBoard
        game={game}
        myIdentity="たろう"
        onMove={vi.fn()}
        onPass={vi.fn()}
        onResign={vi.fn()}
        onBack={onBack}
      />
    );
    fireEvent.click(screen.getByText('← 戻る'));
    expect(onBack).toHaveBeenCalled();
  });

  it('取り石数を表示する', () => {
    const game = createMockGame({ blackCaptures: 3, whiteCaptures: 5 });
    render(
      <GameBoard
        game={game}
        myIdentity="たろう"
        onMove={vi.fn()}
        onPass={vi.fn()}
        onResign={vi.fn()}
      />
    );
    expect(screen.getByText('取3')).toBeInTheDocument();
    expect(screen.getByText('取5')).toBeInTheDocument();
  });

  it('観戦者には操作ボタンが表示されない', () => {
    const game = createMockGame();
    render(
      <GameBoard
        game={game}
        myIdentity="観戦者"
        onMove={vi.fn()}
        onPass={vi.fn()}
        onResign={vi.fn()}
      />
    );
    // 観戦者はパス・投了ボタンが出ない
    expect(screen.queryByText('パス')).not.toBeInTheDocument();
    expect(screen.queryByText('投了')).not.toBeInTheDocument();
  });
});
