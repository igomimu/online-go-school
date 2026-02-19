import { describe, it, expect } from 'vitest';
import { toSgfCoord, generateSGF, parseSGF, parseSGFTree, generateSGFTree } from './sgfUtils';
import { createEmptyBoard } from './gameLogic';

describe('toSgfCoord', () => {
  it('1 → "a"', () => expect(toSgfCoord(1)).toBe('a'));
  it('19 → "s"', () => expect(toSgfCoord(19)).toBe('s'));
  it('26 → "z"', () => expect(toSgfCoord(26)).toBe('z'));
  it('範囲外 0 → ""', () => expect(toSgfCoord(0)).toBe(''));
  it('範囲外 27 → ""', () => expect(toSgfCoord(27)).toBe(''));
});

describe('parseSGF', () => {
  it('SZ（盤面サイズ）を読み取る', () => {
    const result = parseSGF('(;GM[1]FF[4]SZ[13])');
    expect(result.size).toBe(13);
  });

  it('SZがなければ19路', () => {
    const result = parseSGF('(;GM[1]FF[4])');
    expect(result.size).toBe(19);
  });

  it('AB/AWを正しくパース', () => {
    const result = parseSGF('(;GM[1]SZ[9]AB[cc][ee]AW[gg])');
    // cc = (3,3), ee = (5,5), gg = (7,7)
    expect(result.board[2][2]).toEqual({ color: 'BLACK' });
    expect(result.board[4][4]).toEqual({ color: 'BLACK' });
    expect(result.board[6][6]).toEqual({ color: 'WHITE' });
  });

  it('着手(B/W)をパース', () => {
    const result = parseSGF('(;GM[1]SZ[9];B[ee];W[dd])');
    expect(result.moves.length).toBe(2);
    expect(result.moves[0]).toEqual({ x: 5, y: 5, color: 'BLACK' });
    expect(result.moves[1]).toEqual({ x: 4, y: 4, color: 'WHITE' });
  });

  it('メタデータをパース', () => {
    const sgf = '(;GM[1]SZ[19]PB[Iyama Yuta]PW[Ichiriki Ryo]KM[6.5]RE[B+R])';
    const result = parseSGF(sgf);
    expect(result.metadata?.blackName).toBe('Iyama Yuta');
    expect(result.metadata?.whiteName).toBe('Ichiriki Ryo');
    expect(result.metadata?.komi).toBe('6.5');
    expect(result.metadata?.result).toBe('B+R');
  });

  it('LBラベル（手番号）をパース', () => {
    const sgf = '(;GM[1]SZ[9]AB[cc]LB[cc:1])';
    const result = parseSGF(sgf);
    expect(result.board[2][2]?.number).toBe(1);
  });
});

describe('generateSGF', () => {
  it('空盤からSGFを生成', () => {
    const board = createEmptyBoard(9);
    const sgf = generateSGF(board, 9, []);
    expect(sgf).toBe('(;GM[1]FF[4]SZ[9])');
  });

  it('初期配石ありのSGF', () => {
    const board = createEmptyBoard(9);
    board[2][2] = { color: 'BLACK' };
    const sgf = generateSGF(board, 9, []);
    expect(sgf).toContain('AB[cc]');
  });

  it('着手ノードを含むSGF', () => {
    const board = createEmptyBoard(9);
    const nodes = [
      { type: 'MOVE' as const, color: 'BLACK' as const, coord: 'ee' },
      { type: 'MOVE' as const, color: 'WHITE' as const, coord: 'dd' },
    ];
    const sgf = generateSGF(board, 9, nodes);
    expect(sgf).toContain(';B[ee]');
    expect(sgf).toContain(';W[dd]');
  });

  it('メタデータ付きSGF', () => {
    const board = createEmptyBoard(19);
    const sgf = generateSGF(board, 19, [], {
      blackName: '三村智保',
      whiteName: '井山裕太',
      komi: '6.5',
    });
    expect(sgf).toContain('PB[三村智保]');
    expect(sgf).toContain('PW[井山裕太]');
    expect(sgf).toContain('KM[6.5]');
  });
});

describe('parseSGF → generateSGF ラウンドトリップ', () => {
  it('パースして再生成しても情報が保持される', () => {
    const original = '(;GM[1]FF[4]SZ[9]PB[Black]PW[White];B[ee];W[dd])';
    const parsed = parseSGF(original);
    expect(parsed.size).toBe(9);
    expect(parsed.moves.length).toBe(2);
    expect(parsed.metadata?.blackName).toBe('Black');
  });
});

describe('parseSGFTree', () => {
  it('基本的なツリーをパース', () => {
    const sgf = '(;GM[1]SZ[9];B[ee];W[dd])';
    const result = parseSGFTree(sgf);
    expect(result.size).toBe(9);
    expect(result.root.children.length).toBeGreaterThan(0);
  });

  it('分岐（バリエーション）をパース', () => {
    const sgf = '(;GM[1]SZ[9];B[ee](;W[dd])(;W[ff]))';
    const result = parseSGFTree(sgf);
    // ルートの子にB[ee]があり、その子にW[dd]とW[ff]の2つの分岐
    const firstChild = result.root.children[0];
    expect(firstChild.move?.color).toBe('BLACK');
    expect(firstChild.children.length).toBe(2);
  });

  it('マーカー（TR/CR/SQ/MA）をパース', () => {
    const sgf = '(;GM[1]SZ[9];B[ee]TR[dd]CR[ff])';
    const result = parseSGFTree(sgf);
    const node = result.root.children[0];
    expect(node.markers).toBeDefined();
    expect(node.markers!.some(m => m.type === 'SYMBOL' && m.value === 'TRI')).toBe(true);
    expect(node.markers!.some(m => m.type === 'SYMBOL' && m.value === 'CIR')).toBe(true);
  });
});

describe('generateSGFTree', () => {
  it('単一路線のSGFツリーを生成', () => {
    const root = {
      children: [
        {
          move: { x: 5, y: 5, color: 'BLACK' as const },
          children: [
            {
              move: { x: 4, y: 4, color: 'WHITE' as const },
              children: [],
            },
          ],
        },
      ],
    };
    const sgf = generateSGFTree(root, 9);
    expect(sgf).toContain(';B[ee]');
    expect(sgf).toContain(';W[dd]');
    // 分岐がないので(;W[...])のようなバリエーション括弧がない
    expect(sgf).toBe('(;GM[1]FF[4]SZ[9];B[ee];W[dd])');
  });

  it('分岐を含むSGFツリーを生成', () => {
    const root = {
      children: [
        {
          move: { x: 5, y: 5, color: 'BLACK' as const },
          children: [
            {
              move: { x: 4, y: 4, color: 'WHITE' as const },
              children: [],
            },
            {
              move: { x: 6, y: 6, color: 'WHITE' as const },
              children: [],
            },
          ],
        },
      ],
    };
    const sgf = generateSGFTree(root, 9);
    expect(sgf).toContain(';B[ee]');
    expect(sgf).toContain('(;W[dd])');
    expect(sgf).toContain('(;W[ff])');
  });
});
