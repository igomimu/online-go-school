import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
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

  // 古い iPad（iOS 15.3 以前の Safari）は feDropShadow を知らず、SVG は解決できない
  // フィルタを参照した要素を丸ごと描かないため、石だけが盤から消えていた（2026-09-08）。
  // 石の描画をフィルタに依存させないことを固定する。
  it('石の描画にSVGフィルタを使わない（古いiPadで石だけ消えるため）', () => {
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK' };
    board[2][2] = { color: 'WHITE' };
    const { container } = render(<GoBoard boardState={board} boardSize={9} />);

    const stoneGroups = container.querySelectorAll('[data-stone]');
    expect(stoneGroups.length).toBe(2);
    stoneGroups.forEach(group => {
      expect(group.getAttribute('filter')).toBeNull();
      expect(group.querySelectorAll('[filter]').length).toBe(0);
    });
    // 盤のどこにもフィルタ参照を残さない
    expect(container.querySelectorAll('[filter]').length).toBe(0);
    expect(container.querySelector('filter')).toBeNull();
  });

  // 同じ端末で、今度は塗り（url(#stoneBlack) のグラデーション参照）が乗らず
  // 輪郭だけの◯になった。参照が効かなくても石の色が出ることを固定する。
  it('石はグラデーション参照に頼らずベタ色でも塗られる', () => {
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK' };
    board[2][2] = { color: 'WHITE' };
    const { container } = render(<GoBoard boardState={board} boardSize={9} />);

    const stoneGroups = container.querySelectorAll('[data-stone]');
    expect(stoneGroups.length).toBe(2);
    stoneGroups.forEach(group => {
      const solid = Array.from(group.querySelectorAll('circle')).filter(c => {
        const fill = c.getAttribute('fill') ?? '';
        return fill.startsWith('#');
      });
      // ベタ色で塗られた石の円が必ず1つある
      expect(solid.length).toBeGreaterThanOrEqual(1);
    });
  });

  // 矢じりは marker-end="url(#…)" だった。同じ端末では参照が解決されず矢じりだけ
  // 出ないので、三角形を自分で描くようにした。
  it('矢印の矢じりを marker 参照ではなく自前の三角形で描く', () => {
    const board = createEmptyBoard(9);
    const { container } = render(
      <GoBoard
        boardState={board}
        boardSize={9}
        drawings={[
          { fromX: 2, fromY: 2, toX: 6, toY: 2, type: 'arrow' },
          { fromX: 1, fromY: 1, toX: 5, toY: 5, type: 'free', points: [{ x: 1, y: 1 }, { x: 3, y: 3 }, { x: 5, y: 5 }] },
        ]}
      />
    );

    expect(container.querySelector('[data-testid="board-arrowhead"]')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="board-free-arrowhead"]')).toBeInTheDocument();
    expect(container.querySelectorAll('[marker-end]').length).toBe(0);
    expect(container.querySelector('marker')).toBeNull();
  });

  it('矢印でない直線には矢じりを付けない', () => {
    const board = createEmptyBoard(9);
    const { container } = render(
      <GoBoard boardState={board} boardSize={9}
        drawings={[{ fromX: 2, fromY: 2, toX: 6, toY: 2, type: 'line' }]} />
    );
    expect(container.querySelector('[data-testid="board-arrowhead"]')).toBeNull();
  });

  it('手描きの通常線は均一な太さで、矢じりを付けない', () => {
    const board = createEmptyBoard(9);
    const { container } = render(
      <GoBoard boardState={board} boardSize={9} drawings={[{
        fromX: 1, fromY: 1, toX: 5, toY: 5, type: 'free', arrowEnd: false,
        points: [{ x: 1, y: 1 }, { x: 3, y: 3 }, { x: 5, y: 5 }],
      }]} />
    );
    const line = container.querySelector('[data-drawing-variant="plain-line"]');
    expect(line).toHaveAttribute('stroke-width', '8');
    expect(line).toHaveAttribute('fill', 'none');
    expect(container.querySelector('[data-testid="board-free-arrowhead"]')).toBeNull();
  });

  it('手描きの矢印線は先端へ太くなる輪郭と矢じりを描く', () => {
    const board = createEmptyBoard(9);
    const { container } = render(
      <GoBoard boardState={board} boardSize={9} drawings={[{
        fromX: 1, fromY: 1, toX: 5, toY: 1, type: 'free', arrowEnd: true,
        points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 5, y: 1 }],
      }]} />
    );
    const line = container.querySelector('[data-drawing-variant="tapered-arrow"]');
    expect(line).toHaveAttribute('fill', '#e53e3e');
    // 書き出しは1px、矢じりの手前では20px。軸は先端まで伸ばさず肩を出す。
    expect(line?.getAttribute('d')).toMatch(/^M 40 40\.5 .*L 160 50 L 160 30.* Z$/);
    // 矢じりは長さ48px・幅50pxで、一マスより大きく明確に出す。
    expect(container.querySelector('[data-testid="board-free-arrowhead"]'))
      .toHaveAttribute('points', '200,40 152,65 152,15');
    expect(container.querySelector('[data-testid="board-free-arrowhead"]'))
      .toHaveAttribute('opacity', '0.95');
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

  // 石を掴んで別の交点へ動かす（Pocket KataGo と同じ操作、2026-09-16 三村さん）。
  // 盤の座標は getBoundingClientRect と viewBox から出すので、rect を実寸で与える。
  describe('石のドラッグ移動', () => {
    /** 9路盤の viewBox は 0 0 400 400。2倍に引き伸ばした 800px 四方として置く */
    function renderDraggableBoard(onStoneMove = vi.fn()) {
      const board = createEmptyBoard(9);
      board[3][3] = { color: 'BLACK', number: 1 };   // (4,4)
      const view = render(<GoBoard boardState={board} boardSize={9} onStoneMove={onStoneMove} />);
      const svg = view.container.querySelector('svg')!;
      svg.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800, x: 0, y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
      return { ...view, svg, onStoneMove };
    }

    /** 交点 → クライアント座標（margin 40 + (n-1)*40 を2倍） */
    const at = (n: number) => (40 + (n - 1) * 40) * 2;

    it('石を掴んで動かすと、移動元と移動先を渡す', () => {
      const { svg, onStoneMove } = renderDraggableBoard();

      fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: at(4), clientY: at(4) });
      fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', clientX: at(6), clientY: at(6) });
      fireEvent.pointerUp(svg, { pointerId: 1, pointerType: 'mouse', clientX: at(6), clientY: at(6) });

      expect(onStoneMove).toHaveBeenCalledWith({ x: 4, y: 4 }, { x: 6, y: 6 });
    });

    it('動かしている間は、掴んだ石を元の位置に描かない', () => {
      const { svg, container } = renderDraggableBoard();
      expect(container.querySelector('[data-stone="4-4"]')).not.toBeNull();

      fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: at(4), clientY: at(4) });
      fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', clientX: at(6), clientY: at(6) });

      expect(container.querySelector('[data-stone="4-4"]')).toBeNull();
      expect(container.querySelector('[data-testid="stone-drag"]')).not.toBeNull();
    });

    it('掴んだだけで動かさなければ、ただのクリックとして扱う', () => {
      const onStoneMove = vi.fn();
      const onCellClick = vi.fn();
      const board = createEmptyBoard(9);
      board[3][3] = { color: 'BLACK', number: 1 };
      const { container } = render(
        <GoBoard boardState={board} boardSize={9} onStoneMove={onStoneMove} onCellClick={onCellClick} />,
      );
      const svg = container.querySelector('svg')!;
      svg.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800, x: 0, y: 0, toJSON: () => ({}),
      }) as DOMRect;

      fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: at(4), clientY: at(4) });
      fireEvent.pointerUp(svg, { pointerId: 1, pointerType: 'mouse', clientX: at(4), clientY: at(4) });
      fireEvent.click(container.querySelector('[data-cell="4-4"]')!);

      expect(onStoneMove).not.toHaveBeenCalled();
      expect(onCellClick).toHaveBeenCalledWith(4, 4);
    });

    it('動かして離した直後の click は着手にしない', () => {
      const onStoneMove = vi.fn();
      const onCellClick = vi.fn();
      const board = createEmptyBoard(9);
      board[3][3] = { color: 'BLACK', number: 1 };
      const { container } = render(
        <GoBoard boardState={board} boardSize={9} onStoneMove={onStoneMove} onCellClick={onCellClick} />,
      );
      const svg = container.querySelector('svg')!;
      svg.getBoundingClientRect = () => ({
        left: 0, top: 0, right: 800, bottom: 800, width: 800, height: 800, x: 0, y: 0, toJSON: () => ({}),
      }) as DOMRect;

      fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: at(4), clientY: at(4) });
      fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', clientX: at(6), clientY: at(6) });
      fireEvent.pointerUp(svg, { pointerId: 1, pointerType: 'mouse', clientX: at(6), clientY: at(6) });
      fireEvent.click(container.querySelector('[data-cell="6-6"]')!);

      expect(onStoneMove).toHaveBeenCalledTimes(1);
      expect(onCellClick).not.toHaveBeenCalled();
    });

    it('指では掴まない（ピンチ・パンを邪魔しない）', () => {
      const { svg, onStoneMove } = renderDraggableBoard();

      fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'touch', clientX: at(4), clientY: at(4) });
      fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'touch', clientX: at(6), clientY: at(6) });
      fireEvent.pointerUp(svg, { pointerId: 1, pointerType: 'touch', clientX: at(6), clientY: at(6) });

      expect(onStoneMove).not.toHaveBeenCalled();
    });

    it('空の交点からは何も掴まない', () => {
      const { svg, onStoneMove } = renderDraggableBoard();

      fireEvent.pointerDown(svg, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: at(7), clientY: at(7) });
      fireEvent.pointerMove(svg, { pointerId: 1, pointerType: 'mouse', clientX: at(6), clientY: at(6) });
      fireEvent.pointerUp(svg, { pointerId: 1, pointerType: 'mouse', clientX: at(6), clientY: at(6) });

      expect(onStoneMove).not.toHaveBeenCalled();
    });
  });
});
