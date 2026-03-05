import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadStudents, saveStudents, addStudent, updateStudent, deleteStudent, getStudent,
  loadClassrooms, saveClassrooms, addClassroom, updateClassroom, deleteClassroom, getClassroom,
  importAll,
} from './classroomStore';
import type { Student, Classroom } from '../types/classroom';

const testStudent: Student = {
  id: 'S001', name: '田中太郎', rank: '3D', internalRating: 'R5',
  type: 'ネット生', grade: '中2', country: '千葉県',
};

const testClassroom: Classroom = {
  id: 'CLS001', name: 'テスト教室', maxCapacity: 10, studentIds: ['S001'],
};

beforeEach(() => {
  localStorage.clear();
});

describe('生徒CRUD', () => {
  it('空の状態で空配列を返す', () => {
    expect(loadStudents()).toEqual([]);
  });

  it('生徒を追加・取得できる', () => {
    addStudent(testStudent);
    expect(loadStudents()).toHaveLength(1);
    expect(getStudent('S001')).toEqual(testStudent);
  });

  it('生徒を更新できる', () => {
    addStudent(testStudent);
    updateStudent({ ...testStudent, rank: '4D' });
    expect(getStudent('S001')?.rank).toBe('4D');
  });

  it('生徒を削除すると教室からも除外される', () => {
    addStudent(testStudent);
    addClassroom(testClassroom);
    deleteStudent('S001');
    expect(loadStudents()).toHaveLength(0);
    expect(getClassroom('CLS001')?.studentIds).toEqual([]);
  });
});

describe('教室CRUD', () => {
  it('空の状態で空配列を返す', () => {
    expect(loadClassrooms()).toEqual([]);
  });

  it('教室を追加・取得できる', () => {
    addClassroom(testClassroom);
    expect(loadClassrooms()).toHaveLength(1);
    expect(getClassroom('CLS001')?.name).toBe('テスト教室');
  });

  it('教室を更新できる', () => {
    addClassroom(testClassroom);
    updateClassroom({ ...testClassroom, name: '変更後' });
    expect(getClassroom('CLS001')?.name).toBe('変更後');
  });

  it('教室を削除できる', () => {
    addClassroom(testClassroom);
    deleteClassroom('CLS001');
    expect(loadClassrooms()).toHaveLength(0);
  });
});

describe('一括インポート', () => {
  it('既存データを上書きする', () => {
    addStudent(testStudent);
    const newStudents: Student[] = [
      { id: 'S100', name: '新生徒', rank: '1K', internalRating: '', type: '', grade: '', country: '' },
    ];
    importAll(newStudents, []);
    expect(loadStudents()).toHaveLength(1);
    expect(loadStudents()[0].name).toBe('新生徒');
  });
});
