import type { AnswerTreeNode, TsumegoProblemRow } from './tsumegoApi';
import type { Problem } from '../types/problem';
import type { SgfTreeNode } from './sgfUtils';
import { fromSgfCoord } from './sgfUtils';
import { createEmptyBoard } from './gameLogic';
import type { BoardState, StoneColor } from '../components/GoBoard';

function placeSgfStones(board: BoardState, coords: string[], color: StoneColor): void {
  for (const coord of coords) {
    if (coord.length < 2) continue;
    const x = fromSgfCoord(coord[0]);
    const y = fromSgfCoord(coord[1]);
    if (x >= 1 && x <= board.length && y >= 1 && y <= board.length) {
      board[y - 1][x - 1] = { color };
    }
  }
}

// tsumego_problems.answer_tree(0-indexed相当のSGF座標)を、
// online-go-schoolのSgfTreeNode(1-indexed数値座標)へ再帰変換する。
function convertAnswerNode(node: AnswerTreeNode): SgfTreeNode {
  const result: SgfTreeNode = {
    children: node.children.map(convertAnswerNode),
  };
  if (node.coord) {
    const x = fromSgfCoord(node.coord[0]);
    const y = fromSgfCoord(node.coord[1]);
    const color: StoneColor = node.color === 'B' ? 'BLACK' : 'WHITE';
    result.move = { x, y, color };
  }
  if (node.isCorrect !== undefined) result.isCorrect = node.isCorrect;
  if (node.isWrong !== undefined) result.isWrong = node.isWrong;
  return result;
}

function collectAnswerTreeCoords(node: AnswerTreeNode, coords: string[]): void {
  if (node.coord) coords.push(node.coord);
  for (const child of node.children) collectAnswerTreeCoords(child, coords);
}

// DBのview_rangeは101weiqi.com由来データの変換過程でx2が実際の石より
// 1列狭く計算されている不具合が確認されている(右端の石が表示範囲から
// 漏れる)。DBの値をそのまま信用せず、初期配石＋解答手順すべての座標から
// 実際に必要な範囲を計算し、view_rangeがそれを覆っていなければ広げる。
function calcSafeViewRange(row: TsumegoProblemRow) {
  const coords = [...row.initial_black, ...row.initial_white];
  collectAnswerTreeCoords(row.answer_tree, coords);

  let minX = row.board_size;
  let maxX = 1;
  let minY = row.board_size;
  let maxY = 1;
  for (const c of coords) {
    if (c.length < 2) continue;
    const x = fromSgfCoord(c[0]);
    const y = fromSgfCoord(c[1]);
    if (x < 1 || x > row.board_size || y < 1 || y > row.board_size) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const PAD = 1; // 石ぎりぎりだと窮屈なので周囲に1マス余白を持たせる
  return {
    minX: Math.max(1, Math.min(row.view_range.x1, minX - PAD)),
    maxX: Math.min(row.board_size, Math.max(row.view_range.x2, maxX + PAD)),
    minY: Math.max(1, Math.min(row.view_range.y1, minY - PAD)),
    maxY: Math.min(row.board_size, Math.max(row.view_range.y2, maxY + PAD)),
  };
}

/** tsumego_problems の1行を、online-go-school の Problem 型に変換する。 */
export function tsumegoRowToProblem(row: TsumegoProblemRow): Problem {
  const initialBoard = createEmptyBoard(row.board_size);
  placeSgfStones(initialBoard, row.initial_black, 'BLACK');
  placeSgfStones(initialBoard, row.initial_white, 'WHITE');

  return {
    id: row.id,
    title: `${row.problem_type} ${row.level}`,
    boardSize: row.board_size,
    initialBoard,
    correctColor: row.black_first ? 'BLACK' : 'WHITE',
    sgfTree: convertAnswerNode(row.answer_tree),
    difficulty: row.level,
    createdAt: new Date().toISOString(),
    sourceId: row.source_id,
    viewRange: calcSafeViewRange(row),
  };
}
