import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { exportLiveGameToSgf, formatTokyoSgfDate } from './sgf.ts';

describe('formatTokyoSgfDate', () => {
  it('UTC日付ではなく日本時間の日付で整形する', () => {
    assertEquals(formatTokyoSgfDate(new Date('2026-07-06T16:00:00.000Z')), '2026-07-07');
  });
});

describe('exportLiveGameToSgf', () => {
  it('Live対局と着手履歴からSGFを生成する', () => {
    const sgf = exportLiveGameToSgf(
      {
        board_size: 9,
        handicap: 0,
        komi: 6.5,
        black_player: 'sid:black',
        white_player: 'sid:white',
      },
      [
        { x: 3, y: 3, color: 'BLACK' },
        { x: 0, y: 0, color: 'WHITE' },
      ],
      'B+R',
      '2026-07-07',
    );

    assertEquals(sgf, '(;GM[1]FF[4]SZ[9]PB[sid:black]PW[sid:white]KM[6.5]RE[B+R]DT[2026-07-07];B[cc];W[])');
  });

  it('置石とSGF特殊文字を扱う', () => {
    const sgf = exportLiveGameToSgf(
      {
        board_size: 9,
        handicap: 2,
        komi: 0,
        black_player: '黒]A',
        white_player: '白\\B',
      },
      [],
      'W+3.5',
      '2026-07-07',
    );

    assertStringIncludes(sgf, 'PB[黒\\]A]PW[白\\\\B]');
    assertStringIncludes(sgf, 'HA[2]');
    assertStringIncludes(sgf, 'AB[gc][cg]');
  });

  it('3子置石は左上を空けてSGF生成する', () => {
    const sgf = exportLiveGameToSgf(
      {
        board_size: 9,
        handicap: 3,
        komi: 0.5,
        black_player: 'Black',
        white_player: 'White',
      },
      [],
      '',
      '2026-07-07',
    );

    assertStringIncludes(sgf, 'AB[gc][cg][gg]');
  });
});
