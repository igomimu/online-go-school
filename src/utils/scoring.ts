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
  const timedOut = timedOutColorFromResult(result);
  if (timedOut) {
    const loserColor = timedOut === 'BLACK' ? '黒' : '白';
    const winnerColor = timedOut === 'BLACK' ? '白' : '黒';
    return `${loserColor}の時間切れ。${winnerColor}の勝ち`;
  }
  return `結果: ${result}`;
}

/**
 * 時間切れ負けで終わった対局なら、切れた側の色を返す（それ以外は null）。
 * result は勝者側の表記なので "B+T" は「黒の勝ち＝白が時間切れ」。
 */
export function timedOutColorFromResult(result: string | null | undefined): 'BLACK' | 'WHITE' | null {
  const m = result?.trim().match(/^([BW])\+T$/i);
  if (!m) return null;
  return m[1].toUpperCase() === 'B' ? 'WHITE' : 'BLACK';
}

/** 時間切れで終局した対局か（講師による再開の対象） */
export function isTimeoutResult(result: string | null | undefined): boolean {
  return timedOutColorFromResult(result) !== null;
}

/**
 * 目数を囲碁の言い方にする。0.5 は「0目半」ではなく「半目」。
 * 2.5→「2目半」 / 5→「5目」 / 0.5→「半目」
 */
function formatMargin(points: number): string {
  const whole = Math.floor(points);
  const hasHalf = points % 1 !== 0;
  if (whole === 0) return '半目';
  return hasHalf ? `${whole}目半` : `${whole}目`;
}

/**
 * 終局を読み上げる文言（無ければ null）。
 * 勝敗が決まった瞬間に碁盤が閉じてしまうため、声でも結果を伝える（三村さん指定 2026-08-02）。
 * 時間切れは秒読み読み上げ側が「時間切れ負けです」と言うのでここでは扱わない。
 *
 * 文言の作り（すべて三村さん指定）:
 *   投了   「黒、中押し勝ちです」
 *   整地   「黒、2目半勝ちです」「白、半目勝ちです」
 *
 * 「黒」「白」は囲碁では「ク\ロ」「シ\ロ」と頭にアクセントが来るが、「黒の…」と助詞を
 * 続けると TTS が「くろの」をひとまとまりに解析して平板に読んでしまう。読点で語を
 * 独立させ、単語として解析されるようにする。
 * 一度は誤読対策で「ちゅうおしがち」と かな にしたが、仮名の連なりはかえって語の
 * 切れ目を失わせるため、読点で区切ったうえで漢字仮名交じりに戻した。
 *
 * ※ Web Speech API にはアクセントを直接指定する手段がない（SSML は実質未対応）ので、
 *   渡す文字列の切り方でエンジンの解析を誘導するしかない。
 */
export function formatResultSpeech(result: string | null | undefined): string | null {
  const m = result?.trim().match(/^([BW])\+(R|\d+(?:\.\d+)?)$/i);
  if (!m) return null;
  const winner = m[1].toUpperCase() === 'B' ? '黒' : '白';
  if (m[2].toUpperCase() === 'R') return `${winner}、中押し勝ちです`;
  const points = Number(m[2]);
  if (!Number.isFinite(points) || points <= 0) return null;
  return `${winner}、${formatMargin(points)}勝ちです`;
}
