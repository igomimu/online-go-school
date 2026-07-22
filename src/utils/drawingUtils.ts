import type { Drawing } from '../components/GoBoard';

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * 指定座標(グリッド単位)に最も近い描画(線・矢印)のインデックスを返す。
 * 最も近いものでも閾値(グリッド単位の距離)を超えていれば-1を返す
 * (無関係な離れた場所の描画を誤って消さないため)。
 */
export function findNearestDrawingIndex(drawings: Drawing[], x: number, y: number, threshold = 2): number {
  let nearestIdx = -1;
  let nearestDist = Infinity;
  drawings.forEach((d, i) => {
    const dist = distanceToSegment(x, y, d.fromX, d.fromY, d.toX, d.toY);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  });
  return nearestDist <= threshold ? nearestIdx : -1;
}
