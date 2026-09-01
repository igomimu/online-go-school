import { beforeEach, describe, expect, it } from 'vitest';
import { loadTeacherAudioPermissions, saveTeacherAudioPermissions } from './teacherAudioPermissions';

describe('teacherAudioPermissions', () => {
  beforeEach(() => localStorage.clear());

  it('教室ごとに生徒別の音声設定を保存・復元する', () => {
    saveTeacherAudioPermissions('class-a', {
      'sid:1001': { canHear: true, micAllowed: false, cameraAllowed: true },
    });
    saveTeacherAudioPermissions('class-b', {
      'sid:1002': { canHear: false, micAllowed: true, cameraAllowed: true },
    });

    expect(loadTeacherAudioPermissions('class-a')).toEqual({
      'sid:1001': { canHear: true, micAllowed: false, cameraAllowed: true },
    });
    expect(loadTeacherAudioPermissions('class-b')).toEqual({
      'sid:1002': { canHear: false, micAllowed: true, cameraAllowed: true },
    });
  });

  it('壊れた保存値は授業を止めず空設定へ戻す', () => {
    localStorage.setItem('go-school-teacher-audio-permissions:broken', '{');
    expect(loadTeacherAudioPermissions('broken')).toEqual({});
  });
});
