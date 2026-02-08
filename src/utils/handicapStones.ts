// 置石の標準配置（SGF標準準拠）
// 座標は1-indexed

export function getHandicapStones(boardSize: number, handicap: number): { x: number; y: number }[] {
  if (handicap < 2) return [];

  const positions = getHandicapPositions(boardSize);
  if (!positions) return [];

  return positions.slice(0, handicap);
}

function getHandicapPositions(boardSize: number): { x: number; y: number }[] | null {
  // 星の位置に基づいた置石配置
  if (boardSize === 19) {
    return [
      { x: 4, y: 16 },   // 右下
      { x: 16, y: 4 },   // 左上
      { x: 4, y: 4 },    // 右上
      { x: 16, y: 16 },  // 左下
      { x: 10, y: 10 },  // 天元
      { x: 4, y: 10 },   // 右辺
      { x: 16, y: 10 },  // 左辺
      { x: 10, y: 4 },   // 上辺
      { x: 10, y: 16 },  // 下辺
    ];
  }

  if (boardSize === 13) {
    return [
      { x: 4, y: 10 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 10, y: 10 },
      { x: 7, y: 7 },
      { x: 4, y: 7 },
      { x: 10, y: 7 },
      { x: 7, y: 4 },
      { x: 7, y: 10 },
    ];
  }

  if (boardSize === 9) {
    return [
      { x: 3, y: 7 },
      { x: 7, y: 3 },
      { x: 3, y: 3 },
      { x: 7, y: 7 },
      { x: 5, y: 5 },
      { x: 3, y: 5 },
      { x: 7, y: 5 },
      { x: 5, y: 3 },
      { x: 5, y: 7 },
    ];
  }

  return null;
}
