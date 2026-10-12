import { beforeEach, describe, expect, it } from 'vitest';
import type { Student } from '../types/classroom';
import {
  findStudentByIdentity,
  getTeacherDisplayName,
  getDisplayName,
  identityMatchesPlayer,
  resolvePlayerName,
  setRoomTeacherName,
  setTeacherDisplayName,
  studentIdentityCandidates,
} from './identityUtils';

const students: Student[] = [
  {
    id: '1002',
    studentCode: '1002',
    name: '同じ名前',
    rank: '10K',
    internalRating: '',
    type: 'ネット生',
    grade: '',
    country: '',
  },
  {
    id: '1003',
    studentCode: '1003',
    name: '同じ名前',
    rank: '9K',
    internalRating: '',
    type: 'ネット生',
    grade: '',
    country: '',
  },
];

describe('identityUtils', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('生徒照合候補に名前を混ぜない', () => {
    expect(studentIdentityCandidates(students[0])).toEqual(['1002', 'sid:1002']);
  });

  it('講師identityは保存用IDではなく表示名に変換する', () => {
    expect(getDisplayName('teacher', students)).toBe('三村九段');
    expect(getDisplayName('sid:teacher', students)).toBe('三村九段');
    expect(resolvePlayerName('teacher', students)).toBe('三村九段');
    expect(resolvePlayerName('sid:teacher', students)).toBe('三村九段');
    expect(findStudentByIdentity('teacher', students)).toBeUndefined();
  });

  it('講師表示名はブラウザ設定で変更できる', () => {
    setTeacherDisplayName('三村智保 九段');
    expect(getTeacherDisplayName()).toBe('三村智保 九段');
    expect(getDisplayName('teacher', students)).toBe('三村智保 九段');
    expect(resolvePlayerName('teacher', students)).toBe('三村智保 九段');
  });

  it('sid付き生徒identityはIDまたはログインコードだけで名簿解決する', () => {
    expect(findStudentByIdentity('sid:1002', students)?.id).toBe('1002');
    expect(getDisplayName('sid:1003', students)).toBe('同じ名前');
  });

  it('4桁IDを部分一致で同一生徒扱いしない', () => {
    expect(identityMatchesPlayer('sid:10020', '1002')).toBe(false);
    expect(identityMatchesPlayer('sid:x1002', '1002')).toBe(false);
    expect(identityMatchesPlayer('1002', 'sid:10020')).toBe(false);
  });

  it('sid付きidentityを生徒名として扱わない', () => {
    expect(findStudentByIdentity('sid:同じ名前', students)).toBeUndefined();
    expect(getDisplayName('sid:同じ名前', students)).toBe('不明(同じ名前)');
  });

  it('保存された対局者名が同姓同名で曖昧な場合は特定生徒へ寄せない', () => {
    expect(resolvePlayerName('同じ名前', students)).toBe('同じ名前');
  });
});

describe('教室にいる先生の名前（交代制の先生）', () => {
  beforeEach(() => {
    localStorage.clear();
    setRoomTeacherName(null);
  });

  it('生徒の端末では、来ている先生の名乗りで teacher を表示する', () => {
    setRoomTeacherName('かおり先生');
    expect(getDisplayName('teacher', students)).toBe('かおり先生');
    expect(resolvePlayerName('sid:teacher', students)).toBe('かおり先生');
  });

  it('先生の名乗りが無ければ従来どおり端末の表示名（既定は三村九段）', () => {
    expect(getDisplayName('teacher', students)).toBe('三村九段');
    setRoomTeacherName('  ');
    expect(resolvePlayerName('teacher', students)).toBe('三村九段');
  });
});
