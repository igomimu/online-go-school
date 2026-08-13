import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useParticipantLog } from './useParticipantLog';

describe('useParticipantLog', () => {
  it('最初は空', () => {
    const { result } = renderHook(() => useParticipantLog());
    expect(result.current.log).toEqual([]);
  });

  it('来た人と出た人を順に控える', () => {
    const { result } = renderHook(() => useParticipantLog());

    act(() => result.current.record('sid:1001', 'join'));
    act(() => result.current.record('sid:1002', 'join'));
    act(() => result.current.record('sid:1001', 'leave'));

    expect(result.current.log.map(e => [e.identity, e.kind])).toEqual([
      ['sid:1001', 'join'],
      ['sid:1002', 'join'],
      ['sid:1001', 'leave'],
    ]);
  });

  it('同じ人が同じミリ秒で出入りしても key が衝突しない', () => {
    const { result } = renderHook(() => useParticipantLog());

    act(() => {
      result.current.record('sid:1001', 'join');
      result.current.record('sid:1001', 'leave');
      result.current.record('sid:1001', 'join');
    });

    expect(new Set(result.current.log.map(e => e.key)).size).toBe(3);
  });

  it('limit を超えたら古いものから捨てる', () => {
    const { result } = renderHook(() => useParticipantLog(2));

    act(() => result.current.record('a', 'join'));
    act(() => result.current.record('b', 'join'));
    act(() => result.current.record('c', 'join'));

    expect(result.current.log.map(e => e.identity)).toEqual(['b', 'c']);
  });

  it('記録した時刻が入る', () => {
    const before = Date.now();
    const { result } = renderHook(() => useParticipantLog());

    act(() => result.current.record('sid:1001', 'join'));

    const at = result.current.log[0].at.getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });
});
