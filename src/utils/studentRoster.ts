import type { Student, RankDisplay } from '../types/classroom';
import { DEFAULT_RANK_DISPLAY } from '../types/classroom';
import { functionsBaseUrl, getSupabase } from './liveGameApi';

/**
 * 生徒の端末が、自分の教室の仲間と棋力を取る。
 *
 * 名簿（go_school_students）は先生の JWT でしか読めないため、生徒の画面には
 * 棋力が出せなかった（端末に講師機のキャッシュが残っている場合だけ出ていた）。
 * Edge Function `list_classroom_students` が生徒のセッションを見て、その生徒の
 * 教室ぶんだけを返す。
 */

export interface MyClassroom {
  id: string;
  name: string;
  rankDisplay: RankDisplay;
}

export interface MyClassroomRoster {
  classroom: MyClassroom;
  students: Student[];
}

type RosterStudentRow = {
  id?: unknown;
  name?: unknown;
  rank?: unknown;
  internalRating?: unknown;
};

function toStudent(row: RosterStudentRow): Student {
  const id = String(row.id ?? '');
  return {
    id,
    name: String(row.name ?? '') || id,
    rank: String(row.rank ?? ''),
    internalRating: String(row.internalRating ?? ''),
    // 生徒の画面では使わない情報は返していない
    type: '',
    grade: '',
    country: '',
  };
}

/** 取れなければ null（棋力が出ないだけで、教室には入れる） */
export async function fetchMyClassroomRoster(): Promise<MyClassroomRoster | null> {
  const { data } = await getSupabase().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return null;

  const res = await fetch(`${functionsBaseUrl()}/list_classroom_students`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: '{}',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  const body = await res.json();
  const students = Array.isArray(body?.students) ? body.students.map(toStudent).filter((s: Student) => s.id) : [];
  const classroom = body?.classroom ?? {};
  return {
    classroom: {
      id: String(classroom.id ?? ''),
      name: String(classroom.name ?? ''),
      rankDisplay: classroom.rankDisplay === 'rating' ? 'rating' : DEFAULT_RANK_DISPLAY,
    },
    students,
  };
}
