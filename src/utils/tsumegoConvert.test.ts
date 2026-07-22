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

  it('DBのview_rangeが石の配置範囲を覆っていればそのまま使う(GoBoardのViewRange形式へ変換)', () => {
    const problem = tsumegoRowToProblem(makeSimpleRow());
    expect(problem.viewRange).toEqual({ minX: 6, maxX: 18, minY: 1, maxY: 13 });
  });

  it('DBのview_range.x2が実際の石より狭い場合は拡張する(sumatsume由来データの既知の不具合対策)', () => {
    // 実データで確認済みのパターン(例: source_id=22912): 19路盤で石がx=19にあるのに
    // 変換元(101weiqi.com)由来のview_range.x2が18で止まり、盤の右端が表示から漏れていた。
    const problem = tsumegoRowToProblem(makeSimpleRow({
      board_size: 19,
      initial_black: ['nh', 'sd'], // "sd" -> x=19(盤の右端), y=4
      initial_white: ['mi'],
      view_range: { x1: 10, x2: 18, y1: 1, y2: 7 }, // x2=18のまま(石のx=19を覆っていない)
    }));
    expect(problem.viewRange!.maxX).toBeGreaterThanOrEqual(19);
    expect(problem.viewRange!.maxX).toBeLessThanOrEqual(19); // board_sizeでクランプされる
  });

  it('DBのview_rangeが解答手順の座標より狭い場合も拡張する', () => {
    const problem = tsumegoRowToProblem(makeSimpleRow({
      board_size: 19,
      view_range: { x1: 6, x2: 15, y1: 1, y2: 10 }, // "og"(x=15)はギリギリ入るが解答の続きが外に出る想定
      answer_tree: {
        color: '', coord: '',
        children: [
          { color: 'B', coord: 'og', isCorrect: true, children: [
            { color: 'W', coord: 'sg', children: [] }, // "sg" -> x=19, 元のview_rangeを超える
          ] },
        ],
      },
    }));
    expect(problem.viewRange!.maxX).toBe(19);
  });

  it('タイトルはproblem_typeとlevelから生成する', () => {
    const problem = tsumegoRowToProblem(makeSimpleRow({ problem_type: '死活', level: '9K' }));
    expect(problem.title).toBe('死活 9K');
    expect(problem.difficulty).toBe('9K');
  });

  it('本番DBの実データ(source_id=22912)でも盤の右端(x=19)の石が表示範囲に含まれる', () => {
    // 本番DBから取得済み。initial_white/blackに"sf","sc","sb"(x=19)があるのに
    // view_range.x2=18のまま(このsource_idで実際に発生していたバグを再現)。
    const problem = tsumegoRowToProblem({
      id: 'e4ed7f3a-d0df-422c-8f89-ba86155438cb',
      source_id: 22912,
      board_size: 19,
      black_first: true,
      level: '4D+',
      problem_type: '死活',
      book_info: null,
      initial_black: ['mb', 'md', 're', 'na', 'ma', 'ne', 'qe', 'nd', 'sf', 'of', 'pe', 'mc'],
      initial_white: ['nc', 'nb', 'pa', 'sc', 'pd', 'qa', 'qd', 'oe', 'sb'],
      answer_tree: { color: '', coord: '', children: [] },
      view_range: { x1: 10, x2: 18, y1: 1, y2: 7 },
      status: 'verified',
    });
    expect(problem.viewRange!.maxX).toBe(19);
  });
});
