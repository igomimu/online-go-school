import { describe, it, expect, beforeEach } from 'vitest';
import {
  cleanupDuplicateStudentsInClassrooms,
  loadCachedRoster,
  loadClassrooms,
  loadStudents,
} from './classroomStore';
import type { Student, Classroom } from '../types/classroom';

const testStudent: Student = {
  id: 'S001',
  studentCode: 'S001',
  name: '田中太郎',
  rank: '3D',
  internalRating: 'R5',
  type: 'ネット生',
  grade: '中2',
  country: '千葉県',
};

const testClassroom: Classroom = {
  id: 'CLS001',
  name: 'テスト教室',
  maxCapacity: 10,
  studentIds: ['S001'],
};

beforeEach(() => {
  localStorage.clear();
});

describe('名簿キャッシュ', () => {
  it('空の状態で空配列を返す', () => {
    expect(loadStudents()).toEqual([]);
    expect(loadClassrooms()).toEqual([]);
  });

  it('localStorage の既存名簿を移行元キャッシュとして読める', () => {
    localStorage.setItem('go-school-students', JSON.stringify([testStudent]));
    localStorage.setItem('go-school-classrooms', JSON.stringify([testClassroom]));

    expect(loadStudents()).toEqual([testStudent]);
    expect(loadClassrooms()).toEqual([testClassroom]);
    expect(loadCachedRoster()).toEqual({
      students: [testStudent],
      classrooms: [testClassroom],
    });
  });

  it('壊れたJSONは空配列として扱う', () => {
    localStorage.setItem('go-school-students', '{');
    localStorage.setItem('go-school-classrooms', '{');

    expect(loadStudents()).toEqual([]);
    expect(loadClassrooms()).toEqual([]);
  });
});

describe('教室メンバーの正規化', () => {
  it('生徒の複数教室所属を先勝ちで排除する', () => {
    const classrooms = cleanupDuplicateStudentsInClassrooms([
      { id: 'A', name: 'A', maxCapacity: 10, studentIds: ['S001', 'S002'] },
      { id: 'B', name: 'B', maxCapacity: 10, studentIds: ['S002', 'S003'] },
    ]);

    expect(classrooms[0].studentIds).toEqual(['S001', 'S002']);
    expect(classrooms[1].studentIds).toEqual(['S003']);
  });
});
