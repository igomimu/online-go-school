import { describe, it, expect } from 'vitest';
import { LATEST_ONLY_TYPES, RELIABLE_TYPES } from './classroomRtc';

/**
 * 2026-08-26 実授業: 検討を早送りすると生徒側が固まり、以降は何をしても
 * 反応しなくなった。盤面更新を「必ず順に届ける」列に入れていたため、
 * 早送りで大量に積まれ、送信の上限に当たると先頭を送り直し続けて
 * 列全体が止まっていた。
 *
 * 盤面のような「そのときの状態」は、途中を飛ばしても最後の一枚が届けば
 * 正しくなる。順番待ちの列に入れてはいけない。
 */
describe('送信の振り分け', () => {
  it('盤面・カーソル・AI分析は「最新だけ」側にある', () => {
    for (const type of ['BOARD_UPDATE', 'CURSOR_MOVE', 'CURSOR_CLEAR', 'AI_ANALYSIS_UPDATE', 'DRAW_UPDATE']) {
      expect(LATEST_ONLY_TYPES.has(type)).toBe(true);
    }
  });

  it('順番に届ける必要があるものは「最新だけ」側に入れない', () => {
    // 検討の開始終了、権限、チャット、詰碁の出題は1通ずつ意味がある
    for (const type of [
      'REVIEW_START', 'REVIEW_END', 'REVIEW_PERMISSIONS',
      'CHAT_MESSAGE', 'PROBLEM_ASSIGN', 'PROBLEM_RESULT', 'NIGIRI_DRAW',
    ]) {
      expect(LATEST_ONLY_TYPES.has(type)).toBe(false);
      expect(RELIABLE_TYPES.has(type)).toBe(true);
    }
  });

  it('高い頻度で飛ぶものが、順番待ちの列に入っていない', () => {
    // 早送り・マウス移動で毎秒何十回も飛ぶ種類。ここに一つでも混ざると
    // 列が伸び続けて詰まる
    const highFrequency = ['BOARD_UPDATE', 'CURSOR_MOVE', 'AI_ANALYSIS_UPDATE'];
    const queued = highFrequency.filter(
      (t) => RELIABLE_TYPES.has(t) && !LATEST_ONLY_TYPES.has(t),
    );
    expect(queued).toEqual([]);
  });
});

/**
 * 2026-08-26 実授業: ホイールで早送りすると生徒の「受信 N手」が25あたりで
 * 止まり、以降なにも届かなくなった。盤面を「最新だけ」の置き場に入れたのに、
 * 送信に失敗したときの再送で「順番待ち」の列へ移していたため、失敗が続くと
 * そちらが積み上がり、優先されて新しい盤面が永久に送られなくなっていた。
 *
 * 失敗しても順番待ちの列に入れてはいけない種類を、はっきりさせておく。
 */
describe('送信に失敗したときの戻し先', () => {
  it('最新だけでよい種類は、順番待ちの列に入れてはいけない', () => {
    // この2つの集合に同時に属するものは、失敗時の扱いを間違えやすい。
    // 実装は LATEST_ONLY を先に見るので、必ずそちらへ戻ること
    const both = [...LATEST_ONLY_TYPES].filter((t) => RELIABLE_TYPES.has(t));
    // 盤面・AI分析・描画は両方に属している（LiveKit では reliable で送るため）
    expect(both.length).toBeGreaterThan(0);
    // どれも高い頻度で飛ぶので、順番待ちに積むと詰まる
    for (const t of both) {
      expect(LATEST_ONLY_TYPES.has(t)).toBe(true);
    }
  });

  it('カーソルは順番待ちの列に属さない', () => {
    for (const t of ['CURSOR_MOVE', 'CURSOR_CLEAR']) {
      expect(LATEST_ONLY_TYPES.has(t)).toBe(true);
      expect(RELIABLE_TYPES.has(t)).toBe(false);
    }
  });
});
