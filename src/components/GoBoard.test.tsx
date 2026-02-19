import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GoBoard from './GoBoard';
import { createEmptyBoard } from '../utils/gameLogic';

describe('GoBoard', () => {
  it('9路盤をレンダリング', () => {
    const board = createEmptyBoard(9);
    const { container } = render(<GoBoard boardState={board} boardSize={9} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('石を描画する', () => {
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK' };
    board[2][2] = { color: 'WHITE', number: 1 };
    const { container } = render(<GoBoard boardState={board} boardSize={9} />);
    // 黒石と白石のcircleが描画される
    const circles = container.querySelectorAll('circle');
    // 星 (5個 for 9路) + 石2個
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });

  it('クリックイベントが発火する', () => {
    const board = createEmptyBoard(9);
    const handleClick = vi.fn();
    const { container } = render(
      <GoBoard boardState={board} boardSize={9} onCellClick={handleClick} />
    );
    // クリック用のrect要素をクリック
    const rects = container.querySelectorAll('rect[class*="cursor-pointer"]');
    expect(rects.length).toBe(81); // 9x9
    fireEvent.click(rects[0]); // (1,1)
    expect(handleClick).toHaveBeenCalledWith(1, 1);
  });

  it('readOnlyではクリック用rectが描画されない', () => {
    const board = createEmptyBoard(9);
    const { container } = render(
      <GoBoard boardState={board} boardSize={9} readOnly={true} />
    );
    const rects = container.querySelectorAll('rect[class*="cursor-pointer"]');
    expect(rects.length).toBe(0);
  });

  it('座標を非表示にできる', () => {
    const board = createEmptyBoard(9);
    const { container } = render(
      <GoBoard boardState={board} boardSize={9} showCoordinates={false} />
    );
    // text要素は座標のみ（石の番号なし、座標なし）
    const coordTexts = container.querySelectorAll('text');
    expect(coordTexts.length).toBe(0);
  });

  it('手番号を表示できる', () => {
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 1 };
    const { container } = render(
      <GoBoard boardState={board} boardSize={9} showNumbers={true} />
    );
    const texts = container.querySelectorAll('text');
    const numberText = Array.from(texts).find(t => t.textContent === '1');
    expect(numberText).toBeTruthy();
  });

  it('マーカーを描画する', () => {
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK' };
    const markers = [
      { x: 5, y: 5, type: 'SYMBOL' as const, value: 'TRI' },
      { x: 3, y: 3, type: 'LABEL' as const, value: 'A' },
    ];
    const { container } = render(
      <GoBoard boardState={board} boardSize={9} markers={markers} />
    );
    // 三角マーカー（polygon）
    const polygons = container.querySelectorAll('polygon');
    expect(polygons.length).toBeGreaterThanOrEqual(1);
    // ラベル「A」
    const texts = container.querySelectorAll('text');
    const labelA = Array.from(texts).find(t => t.textContent === 'A');
    expect(labelA).toBeTruthy();
  });

  it('星の点を描画する（9路: 5個）', () => {
    const board = createEmptyBoard(9);
    const { container } = render(
      <GoBoard boardState={board} boardSize={9} showCoordinates={false} />
    );
    // 星の点はfill="#000000"のcircle
    const stars = container.querySelectorAll('circle[fill="#000000"]');
    expect(stars.length).toBe(5);
  });

  it('19路盤の星の点は9個', () => {
    const board = createEmptyBoard(19);
    const { container } = render(
      <GoBoard boardState={board} boardSize={19} showCoordinates={false} />
    );
    const stars = container.querySelectorAll('circle[fill="#000000"]');
    expect(stars.length).toBe(9);
  });
});
