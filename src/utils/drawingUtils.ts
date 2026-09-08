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

/** 描画1つと指定座標の距離。free は軌跡の各区間のうち最も近いものを見る */
function distanceToDrawing(d: Drawing, px: number, py: number): number {
  const points = d.type === 'free' ? d.points : undefined;
  if (points && points.length > 0) {
    if (points.length === 1) return Math.hypot(px - points[0].x, py - points[0].y);
    let nearest = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const dist = distanceToSegment(px, py, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      if (dist < nearest) nearest = dist;
    }
    return nearest;
  }
  return distanceToSegment(px, py, d.fromX, d.fromY, d.toX, d.toY);
}

/**
 * 指定座標(グリッド単位)に最も近い描画(線・矢印・曲線)のインデックスを返す。
 * 最も近いものでも閾値(グリッド単位の距離)を超えていれば-1を返す
 * (無関係な離れた場所の描画を誤って消さないため)。
 */
export function findNearestDrawingIndex(drawings: Drawing[], x: number, y: number, threshold = 2): number {
  let nearestIdx = -1;
  let nearestDist = Infinity;
  drawings.forEach((d, i) => {
    const dist = distanceToDrawing(d, x, y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestIdx = i;
    }
  });
  return nearestDist <= threshold ? nearestIdx : -1;
}

export interface BoardPoint { x: number; y: number; }
export interface ViewBoxRect { x: number; y: number; w: number; h: number; }
export interface ElementRect { left: number; top: number; width: number; height: number; }

/**
 * 画面上の座標を盤座標(1..boardSize、小数)へ直す。交点には丸めない。
 *
 * 碁盤のマス目の onMouseEnter では交点単位の整数しか取れず、曲線が描けなかった
 * （2026-09-05 三村さん）。SVG の getScreenCTM() は jsdom に無くテストできないので、
 * 要素の矩形と viewBox の対応から自前で計算する。
 * SVG は preserveAspectRatio 既定 (xMidYMid meet) なので、はみ出した側の余白を差し引く。
 */
export function clientToBoardPoint(
  rect: ElementRect,
  viewBox: ViewBoxRect,
  clientX: number,
  clientY: number,
  margin: number,
  cellSize: number,
): BoardPoint {
  if (rect.width <= 0 || rect.height <= 0 || viewBox.w <= 0 || viewBox.h <= 0) {
    return { x: 1, y: 1 };
  }
  const scale = Math.min(rect.width / viewBox.w, rect.height / viewBox.h);
  const offsetX = (rect.width - viewBox.w * scale) / 2;
  const offsetY = (rect.height - viewBox.h * scale) / 2;
  const svgX = viewBox.x + (clientX - rect.left - offsetX) / scale;
  const svgY = viewBox.y + (clientY - rect.top - offsetY) / scale;
  return {
    x: (svgX - margin) / cellSize + 1,
    y: (svgY - margin) / cellSize + 1,
  };
}

/**
 * 直前の点からの距離がしきい値以上なら軌跡に足す。
 * pointermove は細かく飛んでくるので、そのまま貯めると点が増えすぎる。
 */
export function shouldAppendPoint(last: BoardPoint, next: BoardPoint, minDistance = 0.12): boolean {
  return Math.hypot(next.x - last.x, next.y - last.y) >= minDistance;
}

/** 小数2桁に丸める（配信量を抑えるため。0.01マス＝実寸で0.2mm程度） */
export function roundPoint(p: BoardPoint): BoardPoint {
  return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
}

/**
 * 点列を滑らかな SVG パスにする（Catmull-Rom を3次ベジェへ）。
 * 折れ線のままだと手で描いた線がカクつく。座標は呼び出し側で SVG 座標にしておく。
 */
export function smoothPathD(points: BoardPoint[]): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  if (points.length === 0) return '';
  if (points.length === 1) {
    // 点ひとつでも丸い点として見えるようにする（strokeLinecap="round" 前提）
    return `M ${r(points[0].x)} ${r(points[0].y)} L ${r(points[0].x)} ${r(points[0].y)}`;
  }
  if (points.length === 2) {
    return `M ${r(points[0].x)} ${r(points[0].y)} L ${r(points[1].x)} ${r(points[1].y)}`;
  }
  let d = `M ${r(points[0].x)} ${r(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ${r(p2.x)} ${r(p2.y)}`;
  }
  return d;
}

/**
 * 線の終端に置く矢じり（三角形）の頂点。
 *
 * SVG の `marker-end="url(#…)"` を使わずに自分で描くためのもの。url(#…) の参照を
 * 解決できない端末があり、そこでは矢じりだけが出ない（2026-09-08、碁石の塗りが
 * 乗らなかったのと同じ根）。
 *
 * @param tip    矢じりの先端（線の終点そのものでなくてよい）
 * @param from   向きを決める手前の点
 * @param length 先端から底辺までの長さ
 * @param width  底辺の幅
 * @returns polygon の points 文字列。向きが定まらない（2点が同じ）ときは空文字
 */
export function arrowHeadPoints(
  tip: BoardPoint,
  from: BoardPoint,
  length: number,
  width: number,
): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  const dx = tip.x - from.x;
  const dy = tip.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return '';
  const ux = dx / dist;
  const uy = dy / dist;
  // 底辺の中心と、そこから左右へ伸ばす半幅（進行方向に直交）
  const baseX = tip.x - ux * length;
  const baseY = tip.y - uy * length;
  const halfX = -uy * (width / 2);
  const halfY = ux * (width / 2);
  return `${r(tip.x)},${r(tip.y)} ${r(baseX + halfX)},${r(baseY + halfY)} ${r(baseX - halfX)},${r(baseY - halfY)}`;
}

/**
 * 終点の向きを決めるための、終点から十分離れた直近の点を後ろから探す。
 * 手描きの点列は終盤で密集するので、最後の2点だけを見ると向きが暴れる。
 */
export function directionAnchor(points: BoardPoint[], minDistance = 4): BoardPoint | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  for (let i = points.length - 2; i >= 0; i--) {
    if (Math.hypot(last.x - points[i].x, last.y - points[i].y) >= minDistance) return points[i];
  }
  // どの点も近すぎるときは先頭を使う（同一点なら arrowHeadPoints が空を返す）
  return points[0];
}
