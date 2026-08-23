import { describe, expect, it, vi } from 'vitest';
import { buildTeacherGameWindowUrl, showCreatedGameInTeacherWindow } from './teacherGameWindow';

describe('buildTeacherGameWindowUrl', () => {
  it('作成済みの新規対局IDを講師別ウィンドウへ渡す', () => {
    const url = new URL(buildTeacherGameWindowUrl(
      'https://online.mimura15.jp',
      '/',
      'class 1',
      'teacher',
      'new-game-id',
    ));

    expect(url.searchParams.get('mode')).toBe('game');
    expect(url.searchParams.get('role')).toBe('TEACHER');
    expect(url.searchParams.get('teacherClassroomId')).toBe('class 1');
    expect(url.searchParams.get('identity')).toBe('teacher');
    expect(url.searchParams.get('teacherGameId')).toBe('new-game-id');
  });

  it('新規ID付きURLへ講師窓を切り替えて前面化する', () => {
    const replace = vi.fn();
    const focus = vi.fn();
    showCreatedGameInTeacherWindow({ location: { replace }, focus }, 'https://example.test/?teacherGameId=new');
    expect(replace).toHaveBeenCalledWith('https://example.test/?teacherGameId=new');
    expect(focus).toHaveBeenCalledOnce();
  });
});
