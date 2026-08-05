import { describe, it, expect } from 'vitest';
import { toggleSharingTarget, isSharingTarget } from './sharingTargets';

const ALL = ['sid:1', 'sid:2', 'sid:3'];

describe('isSharingTarget', () => {
  it('null は全員に配信', () => {
    expect(isSharingTarget(null, 'sid:1')).toBe(true);
  });

  it('空配列は誰にも配信しない', () => {
    expect(isSharingTarget([], 'sid:1')).toBe(false);
  });

  it('挙がっている生徒だけ', () => {
    expect(isSharingTarget(['sid:2'], 'sid:2')).toBe(true);
    expect(isSharingTarget(['sid:2'], 'sid:1')).toBe(false);
  });
});

describe('toggleSharingTarget', () => {
  it('全員の状態から一人外すと、残り全員になる', () => {
    expect(toggleSharingTarget(null, 'sid:2', ALL)).toEqual(['sid:1', 'sid:3']);
  });

  it('外した生徒を戻して全員そろうと「全員」に畳む', () => {
    const afterRemove = toggleSharingTarget(null, 'sid:2', ALL);
    expect(toggleSharingTarget(afterRemove, 'sid:2', ALL)).toBeNull();
  });

  it('一人ずつ外していって最後の一人を外しても、全員には戻らない', () => {
    // 空配列を「全員」の意味に使っていたときは、ここで全員に配信されていた
    let targets = toggleSharingTarget(null, 'sid:1', ALL);
    targets = toggleSharingTarget(targets, 'sid:2', ALL);
    targets = toggleSharingTarget(targets, 'sid:3', ALL);
    expect(targets).toEqual([]);
    expect(isSharingTarget(targets, 'sid:1')).toBe(false);
  });

  it('誰もいない状態から一人だけ選べる', () => {
    expect(toggleSharingTarget([], 'sid:3', ALL)).toEqual(['sid:3']);
  });

  it('生徒が一人だけの教室でも、外せて戻せる', () => {
    const one = ['sid:1'];
    const off = toggleSharingTarget(null, 'sid:1', one);
    expect(off).toEqual([]);
    expect(toggleSharingTarget(off, 'sid:1', one)).toBeNull();
  });
});
