import { describe, it, expect } from 'vitest';
import { findNearestDrawingIndex } from './drawingUtils';
import type { Drawing } from '../components/GoBoard';

describe('findNearestDrawingIndex', () => {
  it('線の上の点にはインデックスを返す', () => {
    const drawings: Drawing[] = [{ fromX: 1, fromY: 1, toX: 5, toY: 1, type: 'line' }];
    expect(findNearestDrawingIndex(drawings, 3, 1)).toBe(0);
  });

  it('複数の描画から最も近いものを選ぶ', () => {
    const drawings: Drawing[] = [
      { fromX: 1, fromY: 1, toX: 1, toY: 5, type: 'line' }, // x=1付近
      { fromX: 10, fromY: 1, toX: 10, toY: 5, type: 'line' }, // x=10付近
    ];
    expect(findNearestDrawingIndex(drawings, 9, 3)).toBe(1);
    expect(findNearestDrawingIndex(drawings, 2, 3)).toBe(0);
  });

  it('閾値を超えて離れている場合は-1を返す', () => {
    const drawings: Drawing[] = [{ fromX: 1, fromY: 1, toX: 1, toY: 5, type: 'line' }];
    expect(findNearestDrawingIndex(drawings, 10, 10)).toBe(-1);
  });

  it('描画が無ければ-1を返す', () => {
    expect(findNearestDrawingIndex([], 5, 5)).toBe(-1);
  });

  it('矢印(type=arrow)でも同様に動作する', () => {
    const drawings: Drawing[] = [{ fromX: 3, fromY: 3, toX: 3, toY: 8, type: 'arrow' }];
    expect(findNearestDrawingIndex(drawings, 3, 5)).toBe(0);
  });
});
