import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getSupabase } from './liveGameApi';
import {
  cleanupDuplicateStudentsInClassrooms,
  loadCachedRoster,
  loadClassrooms,
  loadStudents,
  upsertStudent,
} from './classroomStore';
import type { Student, Classroom } from '../types/classroom';

vi.mock('./liveGameApi', () => ({
  getSupabase: vi.fn(),
}));

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
  vi.mocked(getSupabase).mockReset();
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

describe('生徒情報保存', () => {
  it('生徒ID変更時に既存の教室所属と表示順を引き継ぐ', async () => {
    const { upserts, deletes } = installSupabaseMock([
      {
        login_id: 'OLD001',
        name: '旧IDの生徒',
        classroom_id: 'CLASS-A',
        classroom_position: 2,
      },
    ]);

    await upsertStudent(
      {
        id: 'NEW001',
        studentCode: 'NEW001',
        name: '新IDの生徒',
        rank: '1D',
        internalRating: 'R2',
        type: 'ネット生',
        grade: '小5',
        country: '千葉県',
        birthdate: '2015-04-02',
      },
      'OLD001',
    );

    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      login_id: 'NEW001',
      name: '新IDの生徒',
      classroom_id: 'CLASS-A',
      classroom_position: 2,
      rank: '1D',
      internal_rating: 'R2',
      student_type: 'ネット生',
      grade: '小5',
      country: '千葉県',
      birthdate: '2015-04-02',
    });
    expect(deletes).toEqual(['OLD001']);
  });

  it('変更後の生徒IDが既に存在する場合は保存しない', async () => {
    const { upserts, deletes } = installSupabaseMock([
      {
        login_id: 'OLD001',
        name: '旧IDの生徒',
        classroom_id: 'CLASS-A',
        classroom_position: 2,
      },
      {
        login_id: 'NEW001',
        name: '既存生徒',
        classroom_id: 'CLASS-B',
        classroom_position: 0,
      },
    ]);

    await expect(upsertStudent(
      {
        id: 'NEW001',
        studentCode: 'NEW001',
        name: '新IDの生徒',
        rank: '',
        internalRating: '',
        type: '',
        grade: '',
        country: '',
      },
      'OLD001',
    )).rejects.toThrow('生徒ID「NEW001」は既に使われています');

    expect(upserts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });
});

function installSupabaseMock(initialRows: Array<Partial<{
  login_id: string;
  name: string | null;
  classroom_id: string | null;
  classroom_position: number | null;
}>>) {
  const rows = new Map(initialRows.map(row => [row.login_id, row]));
  const upserts: unknown[] = [];
  const deletes: string[] = [];

  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_: string, value: string) => ({
          maybeSingle: vi.fn(async () => ({
            data: rows.get(value) ?? null,
            error: null,
          })),
        })),
      })),
      upsert: vi.fn(async (row: { login_id: string }) => {
        upserts.push(row);
        rows.set(row.login_id, row);
        return { error: null };
      }),
      delete: vi.fn(() => ({
        eq: vi.fn(async (_: string, value: string) => {
          deletes.push(value);
          rows.delete(value);
          return { error: null };
        }),
      })),
    })),
  };

  vi.mocked(getSupabase).mockReturnValue(supabase as never);
  return { upserts, deletes };
}
