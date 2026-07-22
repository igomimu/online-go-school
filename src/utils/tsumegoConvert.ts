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
    viewRange: {
      minX: row.view_range.x1,
      maxX: row.view_range.x2,
      minY: row.view_range.y1,
      maxY: row.view_range.y2,
    },
  };
}
