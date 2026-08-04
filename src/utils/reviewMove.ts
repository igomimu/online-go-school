import type { StoneColor } from '../components/GoBoard';
import { checkCapture } from './gameLogic';
import { addMove, type GameNode } from './treeUtilsV2';

/**
 * 検討盤に一手打つ。
 *
 * 先生が盤をクリックしたときと、許可した生徒から届いた着手（REVIEW_STUDENT_MOVE）の
 * 両方がここを通る。生徒の手も先生の手と同じ扱いにしたいので、判定を1か所に集める。
 *
 * 座標は1始まり。既に石があるなど打てない場所なら null を返す。
 * boardSize を省略した場合はノードが持つ路数を使う。
 */
export function playReviewMove(node: GameNode, x: number, y: number, size?: number): GameNode | null {
  const boardSize = size ?? node.boardSize;
  if (x < 1 || y < 1 || x > boardSize || y > boardSize) return null;
  if (node.board[y - 1]?.[x - 1]) return null;

  const nextColor: StoneColor = node.move
    ? (node.move.color === 'BLACK' ? 'WHITE' : 'BLACK')
    : 'BLACK';

  const newBoard = node.board.map(row => row.map(cell => (cell ? { ...cell } : null)));
  newBoard[y - 1][x - 1] = { color: nextColor, number: node.nextNumber };

  const { board: capturedBoard } = checkCapture(newBoard, x, y, nextColor, boardSize);

  return addMove(
    node,
    capturedBoard,
    node.nextNumber + 1,
    nextColor,
    boardSize,
    { x, y, color: nextColor },
  );
}
