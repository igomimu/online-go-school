import { describe, expect, it } from 'vitest';
import { resolveEffectiveViewMode } from './viewMode';

describe('resolveEffectiveViewMode', () => {
  it('生徒の通常の同期碁盤は授業モードで表示する', () => {
    expect(resolveEffectiveViewMode('STUDENT', 'lobby', true)).toBe('lecture');
  });

  it('生徒が検討モード中は同期碁盤を受けても検討画面を維持する', () => {
    expect(resolveEffectiveViewMode('STUDENT', 'review', true)).toBe('review');
  });

  it('詰碁と対局も同期碁盤で上書きしない', () => {
    expect(resolveEffectiveViewMode('STUDENT', 'problem', true)).toBe('problem');
    expect(resolveEffectiveViewMode('STUDENT', 'game', true)).toBe('game');
  });
});
