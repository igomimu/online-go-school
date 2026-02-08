import { toSgfCoord } from './sgfUtils';
import type { GameMove } from '../types/game';
import { getHandicapStones } from './handicapStones';

// 対局履歴からSGF文字列を生成
export function exportGameToSgf(opts: {
  boardSize: number;
  handicap: number;
  komi: number;
  blackPlayer: string;
  whitePlayer: string;
  result: string;
  moves: GameMove[];
  date?: string;
}): string {
  const { boardSize, handicap, komi, blackPlayer, whitePlayer, result, moves, date } = opts;

  let sgf = `(;GM[1]FF[4]SZ[${boardSize}]`;
  sgf += `PB[${blackPlayer}]PW[${whitePlayer}]`;
  sgf += `KM[${komi}]`;
  if (handicap > 0) sgf += `HA[${handicap}]`;
  if (result) sgf += `RE[${result}]`;
  if (date) sgf += `DT[${date}]`;

  // 置石（ハンディキャップ）
  if (handicap >= 2) {
    const stones = getHandicapStones(boardSize, handicap);
    if (stones.length > 0) {
      sgf += 'AB';
      stones.forEach((s) => {
        sgf += `[${toSgfCoord(s.x)}${toSgfCoord(s.y)}]`;
      });
    }
  }

  // 着手
  for (const move of moves) {
    const colorChar = move.color === 'BLACK' ? 'B' : 'W';
    if (move.x === 0 && move.y === 0) {
      // パス
      sgf += `;${colorChar}[]`;
    } else {
      sgf += `;${colorChar}[${toSgfCoord(move.x)}${toSgfCoord(move.y)}]`;
    }
  }

  sgf += ')';
  return sgf;
}

// 今日の日付をSGF形式で返す
export function todaySgfDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
