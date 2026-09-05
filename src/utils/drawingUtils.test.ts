import { describe, it, expect } from 'vitest';
import {
  findNearestDrawingIndex,
  clientToBoardPoint,
  shouldAppendPoint,
  smoothPathD,
  roundPoint,
} from './drawingUtils';
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

// 2026-09-05 三村さん「曲線を描く機能」。交点に丸めない軌跡を扱えるようにした。
describe('曲線(free)の描画', () => {
  const curve = (points: { x: number; y: number }[]) => ({
    fromX: points[0].x, fromY: points[0].y,
    toX: points[points.length - 1].x, toY: points[points.length - 1].y,
    type: 'free' as const,
    points,
  });

  describe('findNearestDrawingIndex', () => {
    it('軌跡の途中が最も近いときも見つける', () => {
      // 始点(1,1)と終点(9,1)を結ぶ直線からは遠いが、軌跡は(5,7)を通る
      const drawings = [curve([{ x: 1, y: 1 }, { x: 5, y: 7 }, { x: 9, y: 1 }])];
      expect(findNearestDrawingIndex(drawings, 5, 7)).toBe(0);
    });

    it('軌跡から離れていれば-1', () => {
      const drawings = [curve([{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }])];
      expect(findNearestDrawingIndex(drawings, 15, 15)).toBe(-1);
    });

    it('点ひとつだけの軌跡でも距離を測れる', () => {
      const drawings = [curve([{ x: 4, y: 4 }])];
      expect(findNearestDrawingIndex(drawings, 4.5, 4)).toBe(0);
      expect(findNearestDrawingIndex(drawings, 12, 12)).toBe(-1);
    });
  });

  describe('clientToBoardPoint', () => {
    // 9路・座標非表示のときの viewBox（MARGIN=40, CELL_SIZE=40）
    const viewBox = { x: 20, y: 20, w: 360, h: 360 };
    const rect = { left: 0, top: 0, width: 360, height: 360 };

    it('左上の交点(1,1)を返す', () => {
      const p = clientToBoardPoint(rect, viewBox, 20, 20, 40, 40);
      expect(p.x).toBeCloseTo(1);
      expect(p.y).toBeCloseTo(1);
    });

    it('交点の間も小数で返す（丸めない）', () => {
      const p = clientToBoardPoint(rect, viewBox, 40, 40, 40, 40);
      expect(p.x).toBeCloseTo(1.5);
      expect(p.y).toBeCloseTo(1.5);
    });

    it('要素が viewBox より大きくても（拡大表示）比率で換算する', () => {
      const p = clientToBoardPoint({ left: 0, top: 0, width: 720, height: 720 }, viewBox, 40, 40, 40, 40);
      expect(p.x).toBeCloseTo(1);
      expect(p.y).toBeCloseTo(1);
    });

    it('meet の余白（横長の器）を差し引く', () => {
      // 器が横に200広い → 左右に100ずつ余白ができる
      const p = clientToBoardPoint({ left: 0, top: 0, width: 560, height: 360 }, viewBox, 120, 20, 40, 40);
      expect(p.x).toBeCloseTo(1);
      expect(p.y).toBeCloseTo(1);
    });

    it('器の大きさが0でも落ちない', () => {
      expect(clientToBoardPoint({ left: 0, top: 0, width: 0, height: 0 }, viewBox, 10, 10, 40, 40))
        .toEqual({ x: 1, y: 1 });
    });
  });

  describe('shouldAppendPoint', () => {
    it('しきい値以上なら足す', () => {
      expect(shouldAppendPoint({ x: 1, y: 1 }, { x: 1.2, y: 1 })).toBe(true);
    });

    it('しきい値未満なら捨てる（点が増えすぎるのを防ぐ）', () => {
      expect(shouldAppendPoint({ x: 1, y: 1 }, { x: 1.01, y: 1 })).toBe(false);
    });
  });

  describe('smoothPathD', () => {
    it('点が無ければ空', () => {
      expect(smoothPathD([])).toBe('');
    });

    it('1点でも丸い点として見えるパスを返す', () => {
      expect(smoothPathD([{ x: 5, y: 5 }])).toBe('M 5 5 L 5 5');
    });

    it('2点は直線', () => {
      expect(smoothPathD([{ x: 1, y: 1 }, { x: 3, y: 4 }])).toBe('M 1 1 L 3 4');
    });

    it('3点以上は曲線（C コマンド）でつなぐ', () => {
      const d = smoothPathD([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }]);
      expect(d.startsWith('M 0 0')).toBe(true);
      expect((d.match(/C/g) ?? []).length).toBe(2);
      expect(d.endsWith('20 0')).toBe(true);
    });

    it('同じ点が続いても壊れない', () => {
      const d = smoothPathD([{ x: 2, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 2 }]);
      expect(d).toContain('M 2 2');
      expect(d).not.toContain('NaN');
    });
  });

  describe('roundPoint', () => {
    it('小数2桁に丸める', () => {
      expect(roundPoint({ x: 1.23456, y: 7.89123 })).toEqual({ x: 1.23, y: 7.89 });
    });
  });
});
