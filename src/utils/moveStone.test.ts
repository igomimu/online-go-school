import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from './gameLogic';
import { createNode, getMainPath } from './treeUtilsV2';
import { playReviewMove } from './reviewMove';
import { moveStone } from './moveStone';

function makeRoot(size = 9) {
  return createNode(null, createEmptyBoard(size), 1, 'BLACK', size);
}

/** root から現在ノードまで一本道で並べる */
function play(root: ReturnType<typeof makeRoot>, points: Array<[number, number]>) {
  let node = root;
  for (const [x, y] of points) node = playReviewMove(node, x, y)!;
  return node;
}

describe('moveStone', () => {
  it('石を空いている交点へ移す。手数はそのまま', () => {
    const root = makeRoot();
    const current = play(root, [[4, 4], [6, 6]]); // 黒(4,4) 白(6,6)

    const moved = moveStone(root, current, { x: 4, y: 4 }, { x: 3, y: 3 })!;

    expect(moved).not.toBeNull();
    expect(moved.current.board[3][3]).toBeNull();        // 元の場所は空く
    expect(moved.current.board[2][2]).toEqual({ color: 'BLACK', number: 1 });
    expect(moved.current.board[5][5]).toEqual({ color: 'WHITE', number: 2 }); // 後の手は動かない
  });

  it('動かした手は棋譜に残る（手順の長さも色の順も変わらない）', () => {
    const root = makeRoot();
    const current = play(root, [[4, 4], [6, 6], [7, 7]]);

    const moved = moveStone(root, current, { x: 4, y: 4 }, { x: 3, y: 3 })!;
    const moves = getMainPath(moved.root).filter(n => n.move).map(n => n.move!);

    expect(moves).toEqual([
      { x: 3, y: 3, color: 'BLACK' },
      { x: 6, y: 6, color: 'WHITE' },
      { x: 7, y: 7, color: 'BLACK' },
    ]);
  });

  it('動かした結果で石が取れるなら、取りも作り直される', () => {
    const root = makeRoot();
    // 白(1,1) を黒(1,2)(9,9→動かす)で囲む。最後の黒を (2,1) へ動かすと白が取れる
    const current = play(root, [[1, 2], [1, 1], [9, 9]]);
    expect(current.board[0][0]).toEqual({ color: 'WHITE', number: 2 });

    const moved = moveStone(root, current, { x: 9, y: 9 }, { x: 2, y: 1 })!;

    expect(moved.current.board[0][0]).toBeNull(); // 白(1,1)が取られた
    expect(moved.current.board[0][1]).toEqual({ color: 'BLACK', number: 3 });
  });

  it('取られていた石は、取る手を動かすと盤へ戻る', () => {
    const root = makeRoot();
    const current = play(root, [[1, 2], [1, 1], [2, 1]]); // 黒(2,1)で白(1,1)を取る
    expect(current.board[0][0]).toBeNull();

    const moved = moveStone(root, current, { x: 2, y: 1 }, { x: 9, y: 9 })!;

    expect(moved.current.board[0][0]).toEqual({ color: 'WHITE', number: 2 }); // 白が戻る
    expect(moved.current.board[8][8]).toEqual({ color: 'BLACK', number: 3 });
  });

  it('最初から置いてある石（SGFの配置石）も動かせる', () => {
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 0 };   // 置き石
    const root = createNode(null, board, 1, 'WHITE', 9);
    const current = play(root, [[7, 7]]);          // そこから一手進めた局面

    const moved = moveStone(root, current, { x: 5, y: 5 }, { x: 3, y: 3 })!;

    expect(moved.current.board[4][4]).toBeNull();
    expect(moved.current.board[2][2]?.color).toBe('BLACK');
    expect(moved.current.board[6][6]).not.toBeNull(); // 後の手は残る
    expect(moved.root.board[2][2]?.color).toBe('BLACK'); // 置き石そのものが動いている
  });

  it('石が無い場所・石がある場所・盤の外へは動かせない', () => {
    const root = makeRoot();
    const current = play(root, [[4, 4], [6, 6]]);

    expect(moveStone(root, current, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull(); // 掴む石が無い
    expect(moveStone(root, current, { x: 4, y: 4 }, { x: 6, y: 6 })).toBeNull(); // 移動先に石がある
    expect(moveStone(root, current, { x: 4, y: 4 }, { x: 10, y: 4 })).toBeNull(); // 盤の外
    expect(moveStone(root, current, { x: 4, y: 4 }, { x: 4, y: 4 })).toBeNull(); // 同じ場所
  });

  it('ノードの参照が変わる（画面と生徒への配信が更新される）', () => {
    const root = makeRoot();
    const current = play(root, [[4, 4], [6, 6]]);

    const moved = moveStone(root, current, { x: 4, y: 4 }, { x: 3, y: 3 })!;

    expect(moved.current).not.toBe(current);
    expect(moved.root).not.toBe(root);
    // 親子のリンクは張り直されている
    expect(moved.current.parent?.parent).toBe(moved.root);
    expect(moved.root.children[0].parent).toBe(moved.root);
    expect(getMainPath(moved.root).at(-1)).toBe(moved.current);
  });

  it('分岐のある手順でも、今たどっている道の手だけを動かす', () => {
    const root = makeRoot();
    const first = playReviewMove(root, 4, 4)!;
    playReviewMove(first, 6, 6);                    // 分岐A（白6,6）
    const branchB = playReviewMove(first, 7, 7)!;   // 分岐B（白7,7）を現在地にする

    const moved = moveStone(root, branchB, { x: 7, y: 7 }, { x: 8, y: 8 })!;

    expect(moved.current.move).toEqual({ x: 8, y: 8, color: 'WHITE' });
    // もう一方の分岐は触らない
    const other = moved.root.children[0].children.find(n => n.id !== moved.current.id);
    expect(other?.move).toEqual({ x: 6, y: 6, color: 'WHITE' });
  });
});
