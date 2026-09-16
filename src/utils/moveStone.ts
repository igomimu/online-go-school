import type { GameNode } from './treeUtilsV2';
import { getPath, recalculateBoards } from './treeUtilsV2';

/** 盤上の交点。1始まり */
export interface BoardPoint {
  x: number;
  y: number;
}

export interface MoveStoneResult {
  root: GameNode;
  current: GameNode;
}

/**
 * path 上のノードを新しいオブジェクトへ差し替え、親子のリンクを張り直す。
 *
 * このリポジトリの棋譜ツリーは parent/children を持つ可変構造で、盤の作り直しも
 * その場で書き換える（recalculateBoards）。React と生徒への配信は「ノードの参照が
 * 変わったか」で更新を判断しているので、中身だけ書き換えると画面も配信も止まる。
 */
function refreshPath(path: GameNode[]): MoveStoneResult {
  let parent: GameNode | null = null;
  let root: GameNode | null = null;
  let current: GameNode | null = null;

  for (const original of path) {
    const copy: GameNode = { ...original, parent, children: [...original.children] };
    for (const child of copy.children) child.parent = copy;

    if (parent) {
      parent.children = parent.children.map(c => (c.id === original.id ? copy : c));
    } else {
      root = copy;
    }
    parent = copy;
    current = copy;
  }

  return { root: root!, current: current! };
}

/**
 * 盤に置かれている石を、別の交点へ移す（Pocket KataGo と同じ操作）。
 *
 * 手数と手順はそのまま。その石を打った手の座標だけを差し替えて、以降の盤を
 * 作り直す＝棋譜として残り、AI分析もそのまま使える。
 * 読み込んだ棋譜の最初から置いてある石（SGF の AB/AW）は root の盤を直接動かす。
 *
 * 動かせないときは null を返す（移動先に石がある／掴んだ場所に石が無い／盤の外）。
 * 動かした結果ができる形は問わない。検討では有り得ない形も並べて見せるため、
 * 着手禁止点の判定はここではしない。
 */
export function moveStone(
  root: GameNode,
  current: GameNode,
  from: BoardPoint,
  to: BoardPoint,
): MoveStoneResult | null {
  const size = current.board.length;
  const inside = (p: BoardPoint) => p.x >= 1 && p.y >= 1 && p.x <= size && p.y <= size;
  if (!inside(from) || !inside(to)) return null;
  if (from.x === to.x && from.y === to.y) return null;

  const stone = current.board[from.y - 1][from.x - 1];
  if (!stone) return null;
  if (current.board[to.y - 1][to.x - 1]) return null;

  const path = getPath(root, current.id);

  // その石を打った手を、今の局面に近いほうから探す。
  // 同じ交点に打ち直された石があっても、盤に見えているのは最後の一手なので後ろから見る。
  const target = [...path].reverse().find(node =>
    node.move && node.move.x === from.x && node.move.y === from.y && node.move.color === stone.color
  );

  if (target?.parent) {
    target.move = { ...target.move!, x: to.x, y: to.y };
    recalculateBoards(target.parent);
  } else {
    // 手順に無い＝最初から置いてある石。root の盤を直接動かして以降を作り直す
    const board = root.board.map(row => row.map(cell => (cell ? { ...cell } : null)));
    if (!board[from.y - 1][from.x - 1]) return null;
    board[to.y - 1][to.x - 1] = board[from.y - 1][from.x - 1];
    board[from.y - 1][from.x - 1] = null;
    root.board = board;
    recalculateBoards(root);
  }

  return refreshPath(path);
}
