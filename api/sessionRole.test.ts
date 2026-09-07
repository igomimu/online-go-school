import { describe, it, expect } from 'vitest';
import { readSessionRole } from './sessionRole';

describe('readSessionRole', () => {
  it('app_metadata の役割を読む', () => {
    const session = readSessionRole({
      app_metadata: { app_role: 'teacher', teacher_id: 'tid', classroom_id: 'c1' },
    });
    expect(session.isTeacher).toBe(true);
    expect(session.teacherId).toBe('tid');
    expect(session.classroomId).toBe('c1');
  });

  // 2026-09-07 Codex レビュー #1: user_metadata は利用者自身が書き換えられる
  it('user_metadata に teacher と書かれていても先生扱いしない', () => {
    const session = readSessionRole({
      app_metadata: { app_role: 'student', student_id: 'sid-1' },
      user_metadata: { app_role: 'teacher', teacher_id: 'なりすまし' },
    });
    expect(session.isTeacher).toBe(false);
    expect(session.role).toBe('student');
    expect(session.studentId).toBe('sid-1');
    expect(session.teacherId).toBeNull();
  });

  it('app_metadata が空なら権限なし', () => {
    const session = readSessionRole({ user_metadata: { app_role: 'teacher' } });
    expect(session.role).toBeNull();
    expect(session.isTeacher).toBe(false);
  });

  it('知らない役割名は権限なしにする', () => {
    expect(readSessionRole({ app_metadata: { app_role: 'admin' } }).role).toBeNull();
  });

  it('生徒セッションの teacher_id は無視する', () => {
    const session = readSessionRole({
      app_metadata: { app_role: 'student', student_id: 'sid-1', teacher_id: 'tid' },
    });
    expect(session.teacherId).toBeNull();
  });

  it('ゲスト先生の印を読む', () => {
    expect(readSessionRole({ app_metadata: { app_role: 'teacher', is_guest: true } }).isGuest).toBe(true);
    expect(readSessionRole({ app_metadata: { app_role: 'teacher' } }).isGuest).toBe(false);
  });
});
