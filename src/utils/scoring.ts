import type { BoardState, StoneColor } from '../components/GoBoard';

export type TerritoryOwner = 'BLACK' | 'WHITE' | null;

export interface ScoringResult {
  territoryMap: TerritoryOwner[][];
  blackTerritory: number;
  whiteTerritory: number;
  deadBlackStones: number;
  deadWhiteStones: number;
  blackTotal: number;   // territory + captures (including dead white stones)
  whiteTotal: number;   // territory + captures (including dead black stones) + komi
}

/**
 * 地の判定アルゴリズム（日本ルール）
 *
 * 1. 死石を盤面から除去した作業コピーを作成
 * 2. 空点をflood-fillで連結領域に分割
 * 3. 各領域の境界色を調べ、単色なら地、混色ならダメ
 * 4. 地 + アゲハマ + 死石 + コミで得点計算
 */
export function calculateTerritory(
  board: BoardState,
  boardSize: number,
  deadStones: Set<string>, // "x,y" format (1-indexed)
  blackCaptures: number,
  whiteCaptures: number,
  komi: number,
): ScoringResult {
  // Count dead stones by color
  let deadBlack = 0;
  let deadWhite = 0;
  for (const key of deadStones) {
    const [xStr, yStr] = key.split(',');
    const x = parseInt(xStr) - 1;
    const y = parseInt(yStr) - 1;
    const stone = board[y]?.[x];
    if (stone) {
      if (stone.color === 'BLACK') deadBlack++;
      else deadWhite++;
    }
  }

  // Create working board with dead stones removed
  const workBoard: (StoneColor | null)[][] = [];
  for (let y = 0; y < boardSize; y++) {
    const row: (StoneColor | null)[] = [];
    for (let x = 0; x < boardSize; x++) {
      const key = `${x + 1},${y + 1}`;
      if (deadStones.has(key)) {
        row.push(null);
      } else {
        const stone = board[y]?.[x];
        row.push(stone ? stone.color : null);
      }
    }
    workBoard.push(row);
  }

  // Flood-fill to determine territory
  const visited: boolean[][] = Array.from({ length: boardSize }, () =>
    Array(boardSize).fill(false)
  );
  const territoryMap: TerritoryOwner[][] = Array.from({ length: boardSize }, () =>
    Array(boardSize).fill(null)
  );

  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      if (visited[y][x] || workBoard[y][x] !== null) continue;

      // Flood fill from this empty point
      const region: { x: number; y: number }[] = [];
      const borders = new Set<StoneColor>();
      const stack = [{ x, y }];
      visited[y][x] = true;

      while (stack.length > 0) {
        const pos = stack.pop()!;
        region.push(pos);

        for (const [dx, dy] of dirs) {
          const nx = pos.x + dx;
          const ny = pos.y + dy;
          if (nx < 0 || nx >= boardSize || ny < 0 || ny >= boardSize) continue;

          const neighbor = workBoard[ny][nx];
          if (neighbor !== null) {
            borders.add(neighbor);
          } else if (!visited[ny][nx]) {
            visited[ny][nx] = true;
            stack.push({ x: nx, y: ny });
          }
        }
      }

      // Single color border → that color's territory
      let owner: TerritoryOwner = null;
      if (borders.size === 1) {
        owner = borders.values().next().value!;
      }

      for (const pos of region) {
        territoryMap[pos.y][pos.x] = owner;
      }
    }
  }

  // Count territory
  let blackTerritory = 0;
  let whiteTerritory = 0;
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      if (territoryMap[y][x] === 'BLACK') blackTerritory++;
      else if (territoryMap[y][x] === 'WHITE') whiteTerritory++;
    }
  }

  // Japanese rules: territory + captures + dead opponent stones
  const totalBlackCaptures = blackCaptures + deadWhite;
  const totalWhiteCaptures = whiteCaptures + deadBlack;

  return {
    territoryMap,
    blackTerritory,
    whiteTerritory,
    deadBlackStones: deadBlack,
    deadWhiteStones: deadWhite,
    blackTotal: blackTerritory + totalBlackCaptures,
    whiteTotal: whiteTerritory + totalWhiteCaptures + komi,
  };
}

/**
 * 結果文字列を生成（SGF形式）
 * 例: "B+3.5", "W+0.5"
 */
export function formatScoringResult(scoring: ScoringResult): string {
  const diff = scoring.blackTotal - scoring.whiteTotal;
  if (diff > 0) {
    return `B+${diff % 1 === 0 ? diff : diff.toFixed(1)}`;
  } else if (diff < 0) {
    const abs = Math.abs(diff);
    return `W+${abs % 1 === 0 ? abs : abs.toFixed(1)}`;
  }
  return 'ジゴ';
}

/**
 * 終局結果の文字列（例: "B+R", "W+12.5"）を対局者向けの分かりやすい日本語文言に変換する。
 * 投了（+R）のみ「〇が投了しました。〇の中押し勝ち」の専用文言にし、
 * それ以外（目数勝ち・時間切れ等）は簡潔な結果表記のまま返す。
 */
export function formatGameResultMessage(result: string): string {
  const resignMatch = result.match(/^([BW])\+R$/);
  if (resignMatch) {
    const winnerColor = resignMatch[1] === 'B' ? '黒' : '白';
    const loserColor = resignMatch[1] === 'B' ? '白' : '黒';
    return `${loserColor}が投了しました。${winnerColor}の中押し勝ち`;
  }
  const territoryMatch = result.match(/^([BW])\+(\d+(?:\.\d+)?)$/);
  if (territoryMatch) {
    const winnerColor = territoryMatch[1] === 'B' ? '黒' : '白';
    return `${winnerColor}の${territoryMatch[2]}目勝ち`;
  }
  return `結果: ${result}`;
}
