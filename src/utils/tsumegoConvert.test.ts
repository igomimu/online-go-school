import { describe, it, expect } from 'vitest';
import { tsumegoRowToProblem } from './tsumegoConvert';
import type { TsumegoProblemRow } from './tsumegoApi';

// 本番DB(tsumego_problems, source_id=52626)から取得した実データ。
function makeSimpleRow(overrides: Partial<TsumegoProblemRow> = {}): TsumegoProblemRow {
  return {
    id: '2836c1ae-e321-4a33-8244-d20890883bda',
    source_id: 52626,
    board_size: 19,
    black_first: true,
    level: '1D',
    problem_type: '手筋',
    book_info: null,
    initial_black: ['nh', 'qd'],
    initial_white: ['mi', 'jf'],
    answer_tree: {
      color: '',
      coord: '',
      children: [
        { color: 'B', coord: 'og', isCorrect: true, children: [] },
      ],
    },
    view_range: { x1: 6, x2: 18, y1: 1, y2: 13 },
    status: 'verified',
    ...overrides,
  };
}

describe('tsumegoRowToProblem', () => {
  it('初期配石をSGF座標から1-indexed盤面へ変換する', () => {
    const problem = tsumegoRowToProblem(makeSimpleRow());
    // "nh" -> x=fromSgfCoord('n')=14, y=fromSgfCoord('h')=8 -> initialBoard[7][13]
    expect(problem.initialBoard[7][13]).toEqual({ color: 'BLACK' });
    // "qd" -> x=17, y=4 -> initialBoard[3][16]
    expect(problem.initialBoard[3][16]).toEqual({ color: 'BLACK' });
    // "mi" -> x=13, y=9 -> initialBoard[8][12]
    expect(problem.initialBoard[8][12]).toEqual({ color: 'WHITE' });
  });

  it('black_firstからcorrectColorを決める', () => {
    expect(tsumegoRowToProblem(makeSimpleRow({ black_first: true })).correctColor).toBe('BLACK');
    expect(tsumegoRowToProblem(makeSimpleRow({ black_first: false })).correctColor).toBe('WHITE');
  });

  it('answer_treeをSgfTreeNodeへ再帰変換し、座標変換・isCorrect/isWrongを引き継ぐ', () => {
    const problem = tsumegoRowToProblem(makeSimpleRow());
    const firstMove = problem.sgfTree.children[0];
    // "og" -> x=fromSgfCoord('o')=15, y=fromSgfCoord('g')=7
    expect(firstMove.move).toEqual({ x: 15, y: 7, color: 'BLACK' });
    expect(firstMove.isCorrect).toBe(true);
    expect(firstMove.children).toEqual([]);
  });

  it('ルートノードはmoveを持たない', () => {
    const problem = tsumegoRowToProblem(makeSimpleRow());
    expect(problem.sgfTree.move).toBeUndefined();
  });

  it('view_rangeをGoBoardのViewRange形式(minX/maxX/minY/maxY)に変換する', () => {
    const problem = tsumegoRowToProblem(makeSimpleRow());
    expect(problem.viewRange).toEqual({ minX: 6, maxX: 18, minY: 1, maxY: 13 });
  });

  it('タイトルはproblem_typeとlevelから生成する', () => {
    const problem = tsumegoRowToProblem(makeSimpleRow({ problem_type: '死活', level: '9K' }));
    expect(problem.title).toBe('死活 9K');
    expect(problem.difficulty).toBe('9K');
  });
});
