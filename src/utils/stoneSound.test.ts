import { describe, it, expect, beforeEach } from 'vitest';
import { shouldPlayMoveSound, isStoneSoundEnabled, setStoneSoundEnabled } from './stoneSound';

describe('shouldPlayMoveSound', () => {
  it('1手増えて盤上に打たれたときだけ鳴らす', () => {
    expect(shouldPlayMoveSound(10, 11, { x: 4, y: 4 })).toBe(true);
  });

  it('初回マウント（前の手数が未知）では鳴らさない', () => {
    expect(shouldPlayMoveSound(null, 57, { x: 4, y: 4 })).toBe(false);
  });

  it('既存棋譜の一括読み込み・再同期（2手以上増加）では鳴らさない', () => {
    expect(shouldPlayMoveSound(0, 57, { x: 4, y: 4 })).toBe(false);
  });

  it('「待った」やリセットで手数が減ったときは鳴らさない', () => {
    expect(shouldPlayMoveSound(11, 10, { x: 4, y: 4 })).toBe(false);
    expect(shouldPlayMoveSound(11, 0, null)).toBe(false);
  });

  it('パス（x=0,y=0）では鳴らさない', () => {
    expect(shouldPlayMoveSound(10, 11, { x: 0, y: 0 })).toBe(false);
  });

  it('手数が変わらない再描画では鳴らさない', () => {
    expect(shouldPlayMoveSound(11, 11, { x: 4, y: 4 })).toBe(false);
  });
});

describe('石音のON/OFF永続化', () => {
  beforeEach(() => {
    localStorage.clear();
    setStoneSoundEnabled(true);
  });

  it('既定はON', () => {
    expect(isStoneSoundEnabled()).toBe(true);
  });

  it('OFFにするとlocalStorageに保存される', () => {
    setStoneSoundEnabled(false);
    expect(isStoneSoundEnabled()).toBe(false);
    expect(localStorage.getItem('ogs.stoneSoundEnabled')).toBe('off');
  });

  it('ONに戻せる', () => {
    setStoneSoundEnabled(false);
    setStoneSoundEnabled(true);
    expect(isStoneSoundEnabled()).toBe(true);
    expect(localStorage.getItem('ogs.stoneSoundEnabled')).toBe('on');
  });
});
