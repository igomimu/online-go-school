// 置石の標準配置（日本ルール準拠）
// 座標は1-indexed
//
// 2子=右上・左下(対角)、3子=2子+右下、4子=隅4つ、5子=4子+天元、
// 6子=隅4つ+右辺左辺の星(天元なし)、7子=6子+天元、8子=天元以外の星(隅4つ+四辺)、
// 9子=すべての星。6〜8子で天元の有無が入れ替わる非単調な配置（n子の配置が
// n+1子の配置の部分集合にならない）なので、単純なslice方式では表現できない。
// handicap数ごとに個別の組み合わせを定義する。

interface HandicapPoints {
  /** 右下・左上・右上・左下 */
  corners: [Point, Point, Point, Point];
  /** 右辺・左辺・上辺・下辺 */
  sides: [Point, Point, Point, Point];
  center: Point;
}

interface Point {
  x: number;
  y: number;
}

export function getHandicapStones(boardSize: number, handicap: number): Point[] {
  if (handicap < 2) return [];

  const pts = getHandicapPoints(boardSize);
  if (!pts) return [];

  const [br, tl, tr, bl] = pts.corners;
  const [right, left, top, bottom] = pts.sides;
  const { center } = pts;

  switch (handicap) {
    case 2: return [tr, bl];
    case 3: return [tr, bl, br];
    case 4: return [tr, bl, br, tl];
    case 5: return [tr, bl, br, tl, center];
    case 6: return [tr, bl, br, tl, right, left];
    case 7: return [tr, bl, br, tl, right, left, center];
    case 8: return [tr, bl, br, tl, right, left, top, bottom];
    case 9: return [tr, bl, br, tl, right, left, top, bottom, center];
    default: return [];
  }
}

function getHandicapPoints(boardSize: number): HandicapPoints | null {
  if (![19, 17, 15, 13, 11, 9, 7].includes(boardSize)) return null;
  // 13路以上は4線、9・11路は3線、7路は2線を星の基準にする。
  const low = boardSize >= 13 ? 4 : boardSize >= 9 ? 3 : 2;
  const high = boardSize - low + 1;
  const mid = Math.ceil(boardSize / 2);
  return {
    corners: [
      { x: high, y: high },
      { x: low, y: low },
      { x: high, y: low },
      { x: low, y: high },
    ],
    sides: [
      { x: high, y: mid },
      { x: low, y: mid },
      { x: mid, y: low },
      { x: mid, y: high },
    ],
    center: { x: mid, y: mid },
  };
}
