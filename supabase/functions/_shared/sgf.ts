type Color = 'BLACK' | 'WHITE';

export interface SgfMove {
  x: number;
  y: number;
  color: Color;
}

export interface SgfGame {
  board_size: number;
  handicap: number;
  komi: number;
  black_player: string;
  white_player: string;
}

function toSgfCoord(n: number): string {
  return String.fromCharCode('a'.charCodeAt(0) + n - 1);
}

function escapeSgfValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\]/g, '\\]');
}

function handicapStones(boardSize: number, handicap: number): Array<{ x: number; y: number }> {
  if (handicap < 2) return [];

  const low = boardSize === 9 ? 3 : 4;
  const high = boardSize - low + 1;
  const mid = Math.ceil(boardSize / 2);

  const points: Record<number, Array<{ x: number; y: number }>> = {
    2: [{ x: high, y: low }, { x: low, y: high }],
    3: [{ x: high, y: low }, { x: low, y: high }, { x: low, y: low }],
    4: [{ x: high, y: low }, { x: low, y: high }, { x: low, y: low }, { x: high, y: high }],
    5: [{ x: high, y: low }, { x: low, y: high }, { x: low, y: low }, { x: high, y: high }, { x: mid, y: mid }],
    6: [{ x: high, y: low }, { x: low, y: high }, { x: low, y: low }, { x: high, y: high }, { x: low, y: mid }, { x: high, y: mid }],
    7: [{ x: high, y: low }, { x: low, y: high }, { x: low, y: low }, { x: high, y: high }, { x: low, y: mid }, { x: high, y: mid }, { x: mid, y: mid }],
    8: [{ x: high, y: low }, { x: low, y: high }, { x: low, y: low }, { x: high, y: high }, { x: low, y: mid }, { x: high, y: mid }, { x: mid, y: low }, { x: mid, y: high }],
    9: [{ x: high, y: low }, { x: low, y: high }, { x: low, y: low }, { x: high, y: high }, { x: low, y: mid }, { x: high, y: mid }, { x: mid, y: low }, { x: mid, y: high }, { x: mid, y: mid }],
  };

  return points[handicap] ?? [];
}

export function formatTokyoSgfDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

export function exportLiveGameToSgf(game: SgfGame, moves: SgfMove[], result: string, date: string): string {
  let sgf = `(;GM[1]FF[4]SZ[${game.board_size}]`;
  sgf += `PB[${escapeSgfValue(game.black_player)}]PW[${escapeSgfValue(game.white_player)}]`;
  sgf += `KM[${game.komi}]`;
  if (game.handicap > 0) sgf += `HA[${game.handicap}]`;
  if (result) sgf += `RE[${escapeSgfValue(result)}]`;
  if (date) sgf += `DT[${escapeSgfValue(date)}]`;

  const stones = handicapStones(game.board_size, game.handicap);
  if (stones.length > 0) {
    sgf += 'AB';
    for (const stone of stones) {
      sgf += `[${toSgfCoord(stone.x)}${toSgfCoord(stone.y)}]`;
    }
  }

  for (const move of moves) {
    const color = move.color === 'BLACK' ? 'B' : 'W';
    if (move.x === 0 && move.y === 0) {
      sgf += `;${color}[]`;
    } else {
      sgf += `;${color}[${toSgfCoord(move.x)}${toSgfCoord(move.y)}]`;
    }
  }

  return `${sgf})`;
}
