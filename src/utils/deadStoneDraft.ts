import type { BoardState } from '../components/GoBoard';
import type { LiveGameRow, LiveMoveRow } from './liveGameApi';
import { getHandicapStones } from './handicapStones';
import { analyzePosition, convertMovesToKatago, loadAiSettings, toGtpCoord } from './katagoClient';

/**
 * 死石の下書きを作る（大手のネット碁と同じ「AIが下書き、決めるのは対局者」の形）。
 *
 * KataGo の ownership は 1点ごとの所有率。自分の石なのに相手の地になっている石＝死石、
 * として拾う。終わっていない局面では当てにならないので、あくまで下書きとして出し、
 * 対局者がクリックで直せることが前提。
 */

/** ここを下回る確からしさの点は触らない（数え切れていない局面で暴れさせない） */
export const DEAD_STONE_OWNERSHIP_THRESHOLD = 0.5;

/** 下書きに使う読みの量。整地の待ち時間なので浅く早く。 */
export const DRAFT_MAX_VISITS = 50;

/**
 * KataGo の ownership は手番側から見た符号（analysis.cfg の reportAnalysisWinratesAs =
 * SIDETOMOVE）。黒から見た符号（+が黒地）へ揃える。
 */
export function ownershipFromBlack(ownership: number[], toPlay: 'BLACK' | 'WHITE'): number[] {
  return toPlay === 'BLACK' ? ownership : ownership.map(value => -value);
}

/**
 * 盤上の石のうち、相手の地の中にある石を死石として拾う。
 * 返す並びは整地の死石と同じ "x,y"（1始まり）。
 */
export function draftDeadStones(
  board: BoardState,
  boardSize: number,
  ownership: number[],
  threshold: number = DEAD_STONE_OWNERSHIP_THRESHOLD,
): string[] {
  if (ownership.length !== boardSize * boardSize) return [];
  const dead: string[] = [];
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const stone = board[y]?.[x];
      if (!stone) continue;
      const value = ownership[y * boardSize + x];
      const takenByOpponent = stone.color === 'BLACK'
        ? value <= -threshold
        : value >= threshold;
      if (takenByOpponent) dead.push(`${x + 1},${y + 1}`);
    }
  }
  return dead;
}

/** 置石は着手ではないので、KataGo には初期配置として渡す */
export function handicapInitialStones(game: LiveGameRow): [string, string][] {
  if (game.handicap < 2) return [];
  return getHandicapStones(game.board_size, game.handicap)
    .map(stone => ['B', toGtpCoord(stone.x, stone.y, game.board_size)] as [string, string]);
}

/**
 * KataGo に一度だけ聞いて、死石の下書きを返す。
 * 分析できなければ null（下書き無しで整地に入る。失敗しても整地は続けられる）。
 */
export async function fetchDeadStoneDraft(
  game: LiveGameRow,
  moves: LiveMoveRow[],
  board: BoardState,
  toPlay: 'BLACK' | 'WHITE',
): Promise<string[] | null> {
  try {
    const result = await analyzePosition({
      moves: convertMovesToKatago(moves, game.board_size),
      boardSize: game.board_size,
      komi: game.komi,
      maxVisits: Math.min(loadAiSettings().maxVisits, DRAFT_MAX_VISITS),
      initialStones: handicapInitialStones(game),
    });
    if (!result.ownership) return null;
    return draftDeadStones(board, game.board_size, ownershipFromBlack(result.ownership, toPlay));
  } catch (err) {
    console.error('[dead stone draft] failed:', err);
    return null;
  }
}
