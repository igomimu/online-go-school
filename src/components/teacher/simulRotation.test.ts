import { describe, expect, it } from 'vitest';
import {
  getNewActiveGameId,
  getDefaultActiveGameId,
  getNextTeacherTurnGameId,
  isTeacherParticipant,
  type GameSessionInfo,
} from './simulRotation';

describe('getNextTeacherTurnGameId (次盤選定ロジック)', () => {
  const teacherId = 'teacher';

  it('sid prefix の有無が違っても講師対局として扱う', () => {
    expect(isTeacherParticipant({ black_player: 'sid:teacher', white_player: 'sid:student-a' }, teacherId)).toBe(true);
  });

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

describe('getNewActiveGameId (新規盤の検出)', () => {
  const session = (id: string, status: string): GameSessionInfo => ({
    game: { id, status, black_player: 'sid:student-a', white_player: 'teacher' },
    snapshot: { currentColor: 'BLACK', lastMoveAt: null },
  });

  it('古い中断局が表示中でも、追加された新規対局を初手前に検出する', () => {
    const sessions = [session('new-playing', 'playing'), session('old-interrupted', 'interrupted')];
    expect(getNewActiveGameId(sessions, new Set(['old-interrupted']))).toBe('new-playing');
  });

  it('追加されたのが中断局だけなら自動切替しない', () => {
    const sessions = [session('new-interrupted', 'interrupted'), session('old-interrupted', 'interrupted')];
    expect(getNewActiveGameId(sessions, new Set(['old-interrupted']))).toBeNull();
  });

  it('既に把握している進行中対局は新規局として扱わない', () => {
    const sessions = [session('playing', 'playing'), session('old-interrupted', 'interrupted')];
    expect(getNewActiveGameId(sessions, new Set(['playing', 'old-interrupted']))).toBeNull();
  });
});

describe('getDefaultActiveGameId (自動表示する盤)', () => {
  const teacherId = 'teacher';
  const session = (id: string, status: string, currentColor: 'BLACK' | 'WHITE' = 'BLACK'): GameSessionInfo => ({
    game: { id, status, black_player: 'sid:student-a', white_player: teacherId },
    snapshot: { currentColor, lastMoveAt: null },
  });

  it('相手の初手前でも進行中の新規対局を表示する', () => {
    const sessions = [session('new-playing', 'playing'), session('old-interrupted', 'interrupted')];
    expect(getDefaultActiveGameId(sessions, teacherId)).toBe('new-playing');
  });

  it('終局後に古い中断局へ自動的に戻らない', () => {
    const sessions = [session('old-interrupted', 'interrupted')];
    expect(getDefaultActiveGameId(sessions, teacherId)).toBeNull();
  });

  it('講師の手番になっている盤を優先する', () => {
    const sessions = [
      session('opponent-turn', 'playing', 'BLACK'),
      session('teacher-turn', 'playing', 'WHITE'),
    ];
    expect(getDefaultActiveGameId(sessions, teacherId)).toBe('teacher-turn');
  });
});
