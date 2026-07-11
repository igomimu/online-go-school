import { describe, expect, it } from 'vitest';
import { getNextTeacherTurnGameId, type GameSessionInfo } from './SimulGrid';

describe('getNextTeacherTurnGameId (次盤選定ロジック)', () => {
  const teacherId = 'teacher';

  it('0面（空配列）の場合は null を返す', () => {
    const result = getNextTeacherTurnGameId([], teacherId);
    expect(result).toBeNull();
  });

  it('1面で自分の手番かつ playing の場合はそのゲームIDを返す', () => {
    const sessions: GameSessionInfo[] = [
      {
        game: { id: 'game-1', status: 'playing', black_player: 'sid:student-a', white_player: 'teacher' },
        snapshot: { currentColor: 'WHITE', lastMoveAt: '2026-07-11T12:00:00.000Z' },
      },
    ];
    const result = getNextTeacherTurnGameId(sessions, teacherId);
    expect(result).toBe('game-1');
  });

  it('1面で相手の手番の場合は null を返す', () => {
    const sessions: GameSessionInfo[] = [
      {
        game: { id: 'game-1', status: 'playing', black_player: 'sid:student-a', white_player: 'teacher' },
        snapshot: { currentColor: 'BLACK', lastMoveAt: '2026-07-11T12:00:00.000Z' },
      },
    ];
    const result = getNextTeacherTurnGameId(sessions, teacherId);
    expect(result).toBeNull();
  });

  it('1面で自分の手番だが scoring の場合は null を返す', () => {
    const sessions: GameSessionInfo[] = [
      {
        game: { id: 'game-1', status: 'scoring', black_player: 'sid:student-a', white_player: 'teacher' },
        snapshot: { currentColor: 'WHITE', lastMoveAt: '2026-07-11T12:00:00.000Z' },
      },
    ];
    const result = getNextTeacherTurnGameId(sessions, teacherId);
    expect(result).toBeNull();
  });

  it('複数面で自分の手番がある場合、最終着手が最も古い盤を返す', () => {
    const sessions: GameSessionInfo[] = [
      {
        game: { id: 'game-1', status: 'playing', black_player: 'sid:student-a', white_player: 'teacher' },
        snapshot: { currentColor: 'WHITE', lastMoveAt: '2026-07-11T12:10:00.000Z' }, // 新しい
      },
      {
        game: { id: 'game-2', status: 'playing', black_player: 'sid:student-b', white_player: 'teacher' },
        snapshot: { currentColor: 'WHITE', lastMoveAt: '2026-07-11T12:05:00.000Z' }, // 最も古い
      },
      {
        game: { id: 'game-3', status: 'playing', black_player: 'sid:student-c', white_player: 'teacher' },
        snapshot: { currentColor: 'WHITE', lastMoveAt: '2026-07-11T12:08:00.000Z' },
      },
    ];
    const result = getNextTeacherTurnGameId(sessions, teacherId);
    expect(result).toBe('game-2');
  });

  it('複数面で自分の手番と相手の手番が混在する場合、自分の手番かつ最古のものを返す', () => {
    const sessions: GameSessionInfo[] = [
      {
        game: { id: 'game-1', status: 'playing', black_player: 'sid:student-a', white_player: 'teacher' },
        snapshot: { currentColor: 'WHITE', lastMoveAt: '2026-07-11T12:10:00.000Z' }, // 自分の手番（新しい）
      },
      {
        game: { id: 'game-2', status: 'playing', black_player: 'sid:student-b', white_player: 'teacher' },
        snapshot: { currentColor: 'BLACK', lastMoveAt: '2026-07-11T12:01:00.000Z' }, // 相手の手番（最古）
      },
      {
        game: { id: 'game-3', status: 'playing', black_player: 'sid:student-c', white_player: 'teacher' },
        snapshot: { currentColor: 'WHITE', lastMoveAt: '2026-07-11T12:05:00.000Z' }, // 自分の手番（最古）
      },
    ];
    const result = getNextTeacherTurnGameId(sessions, teacherId);
    expect(result).toBe('game-3');
  });

  it('lastMoveAt が null/undefined の場合は最古として扱われる', () => {
    const sessions: GameSessionInfo[] = [
      {
        game: { id: 'game-1', status: 'playing', black_player: 'sid:student-a', white_player: 'teacher' },
        snapshot: { currentColor: 'WHITE', lastMoveAt: '2026-07-11T12:05:00.000Z' },
      },
      {
        game: { id: 'game-2', status: 'playing', black_player: 'sid:student-b', white_player: 'teacher' },
        snapshot: { currentColor: 'WHITE', lastMoveAt: null }, // 最古
      },
    ];
    const result = getNextTeacherTurnGameId(sessions, teacherId);
    expect(result).toBe('game-2');
  });
});
