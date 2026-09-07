import { describe, it, expect, beforeEach } from 'vitest';
import { saveRecordDraft, loadRecordDraft, clearRecordDraft } from './recordDraft';

describe('recordDraft（棋譜作成の下書き）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('何も無ければ null', () => {
    expect(loadRecordDraft()).toBeNull();
  });

  it('入力途中の棋譜を残して読み戻せる', () => {
    saveRecordDraft('(;FF[4]GM[1]SZ[19];B[pd])', 19, 1757200000000);

    expect(loadRecordDraft()).toEqual({
      sgf: '(;FF[4]GM[1]SZ[19];B[pd])',
      boardSize: 19,
      savedAt: 1757200000000,
    });
  });

  it('捨てたら消える', () => {
    saveRecordDraft('(;FF[4]GM[1]SZ[9])', 9);
    clearRecordDraft();

    expect(loadRecordDraft()).toBeNull();
  });

  it('壊れた中身は無かったことにする（読み込みで落ちない）', () => {
    localStorage.setItem('go-school-record-draft', '{ここは壊れている');
    expect(loadRecordDraft()).toBeNull();

    localStorage.setItem('go-school-record-draft', JSON.stringify({ sgf: '', boardSize: 19 }));
    expect(loadRecordDraft()).toBeNull();

    localStorage.setItem('go-school-record-draft', JSON.stringify({ sgf: '(;FF[4])' }));
    expect(loadRecordDraft()).toBeNull();
  });
});
