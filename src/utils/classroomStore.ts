import type { Student, Classroom } from '../types/classroom';
import { getSupabase } from './liveGameApi';

const STUDENTS_KEY = 'go-school-students';
const CLASSROOMS_KEY = 'go-school-classrooms';

type GoSchoolStudentRow = {
  login_id: string;
  name: string | null;
  classroom_id: string | null;
  classroom_position: number | null;
  rank: string | null;
  internal_rating: string | null;
  student_type: string | null;
  grade: string | null;
  country: string | null;
  birthdate: string | null;
};

type GoSchoolClassroomRow = {
  id: string;
  name: string | null;
  max_capacity: number | null;
};

export interface ClassroomRoster {
  students: Student[];
  classrooms: Classroom[];
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) as T : fallback;
  } catch {
    return fallback;
  }
}

function cacheRoster(roster: ClassroomRoster): void {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(roster.students));
  localStorage.setItem(CLASSROOMS_KEY, JSON.stringify(roster.classrooms));
}

function normalizeStudent(student: Student): Student {
  const loginId = (student.studentCode || student.id || '').trim();
  return {
    ...student,
    id: loginId,
    studentCode: loginId,
    name: student.name || '',
    rank: student.rank || '',
    internalRating: student.internalRating || '',
    type: student.type || '',
    grade: student.grade || '',
    country: student.country || '',
    birthdate: student.birthdate || '',
  };
}

function toStudentRow(student: Student, classroomId?: string | null, position?: number | null) {
  const normalized = normalizeStudent(student);
  return {
    login_id: normalized.id,
    name: normalized.name,
    classroom_id: classroomId ?? null,
    classroom_position: position ?? null,
    rank: normalized.rank,
    internal_rating: normalized.internalRating,
    student_type: normalized.type,
    grade: normalized.grade,
    country: normalized.country,
    birthdate: normalized.birthdate || null,
    updated_at: new Date().toISOString(),
  };
}

function toStudentProfileRow(student: Student) {
  const normalized = normalizeStudent(student);
  return {
    login_id: normalized.id,
    name: normalized.name,
    rank: normalized.rank,
    internal_rating: normalized.internalRating,
    student_type: normalized.type,
    grade: normalized.grade,
    country: normalized.country,
    birthdate: normalized.birthdate || null,
    updated_at: new Date().toISOString(),
  };
}

function toStudent(row: GoSchoolStudentRow): Student {
  return {
    id: row.login_id,
    studentCode: row.login_id,
    name: row.name || row.login_id,
    rank: row.rank || '',
    internalRating: row.internal_rating || '',
    type: row.student_type || '',
    grade: row.grade || '',
    country: row.country || '',
    birthdate: row.birthdate || '',
  };
}

function buildRoster(studentRows: GoSchoolStudentRow[], classroomRows: GoSchoolClassroomRow[]): ClassroomRoster {
  const students = studentRows
    .map(toStudent)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const studentsByClassroom = new Map<string, GoSchoolStudentRow[]>();
  for (const row of studentRows) {
    if (!row.classroom_id) continue;
    const list = studentsByClassroom.get(row.classroom_id) ?? [];
    list.push(row);
    studentsByClassroom.set(row.classroom_id, list);
  }

  const classrooms = classroomRows
    .map(row => {
      const members = studentsByClassroom.get(row.id) ?? [];
      members.sort((a, b) => {
        const posA = a.classroom_position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.classroom_position ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
        return (a.name || a.login_id).localeCompare(b.name || b.login_id, 'ja');
      });
      return {
        id: row.id,
        name: row.name || row.id,
        maxCapacity: row.max_capacity || 10,
        studentIds: members.map(s => s.login_id),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  return { students, classrooms };
}

function hasRosterData(roster: ClassroomRoster): boolean {
  return roster.students.length > 0 || roster.classrooms.length > 0;
}

// === localStorage cache / migration source ===

export function loadStudents(): Student[] {
  return readJson<Student[]>(STUDENTS_KEY, []);
}

export function loadClassrooms(): Classroom[] {
  return readJson<Classroom[]>(CLASSROOMS_KEY, []);
}

export function loadCachedRoster(): ClassroomRoster {
  return { students: loadStudents(), classrooms: loadClassrooms() };
}

// 重複登録を自動検知して排除するクリーンアップヘルパー
export function cleanupDuplicateStudentsInClassrooms(classrooms: Classroom[]): Classroom[] {
  const seenStudentIds = new Set<string>();
  return classrooms.map(c => {
    const uniqueStudentIds = c.studentIds.filter(sid => {
      if (seenStudentIds.has(sid)) return false;
      seenStudentIds.add(sid);
      return true;
    });
    return { ...c, studentIds: uniqueStudentIds };
  });
}

// === Supabase authoritative roster ===

export async function fetchRoster(): Promise<ClassroomRoster> {
  const supabase = getSupabase();
  const [{ data: studentRows, error: studentsError }, { data: classroomRows, error: classroomsError }] = await Promise.all([
    supabase
      .from('go_school_students')
      .select('login_id,name,classroom_id,classroom_position,rank,internal_rating,student_type,grade,country,birthdate')
      .order('name', { ascending: true }),
    supabase
      .from('go_school_classrooms')
      .select('id,name,max_capacity')
      .order('name', { ascending: true }),
  ]);

  if (studentsError) throw new Error(studentsError.message);
  if (classroomsError) throw new Error(classroomsError.message);

  const roster = buildRoster(
    (studentRows ?? []) as GoSchoolStudentRow[],
    (classroomRows ?? []) as GoSchoolClassroomRow[],
  );

  // サーバーが空でローカルに名簿がある場合は、ローカルを正として返す。
  // （サーバー未保存/一時的な空応答で「教室が見つからない」状態にしない）
  if (!hasRosterData(roster)) {
    const cached = loadCachedRoster();
    if (hasRosterData(cached)) {
      return cached;
    }
    cacheRoster(roster);
    return roster;
  }

  // サーバーに名簿がある場合はそれを正とし、ローカルキャッシュも更新
  cacheRoster(roster);
  return roster;
}

export async function upsertStudent(student: Student, previousId?: string): Promise<void> {
  const normalized = normalizeStudent(student);
  if (!normalized.id) throw new Error('ログインコードが空です');

  const supabase = getSupabase();
  const { error } = await supabase
    .from('go_school_students')
    .upsert(toStudentProfileRow(normalized), { onConflict: 'login_id' });
  if (error) throw new Error(error.message);

  if (previousId && previousId !== normalized.id) {
    const { error: deleteError } = await supabase
      .from('go_school_students')
      .delete()
      .eq('login_id', previousId);
    if (deleteError) throw new Error(deleteError.message);
  }
}

export async function deleteStudent(id: string): Promise<void> {
  const targetId = (id || '').trim();
  if (!targetId) return;
  const { error } = await getSupabase()
    .from('go_school_students')
    .delete()
    .eq('login_id', targetId);
  if (error) throw new Error(error.message);
}

export async function upsertStudents(students: Student[]): Promise<void> {
  const rows = students.map(s => toStudentProfileRow(s));
  if (rows.length === 0) return;
  const { error } = await getSupabase()
    .from('go_school_students')
    .upsert(rows, { onConflict: 'login_id' });
  if (error) throw new Error(error.message);
}

export async function upsertClassroom(classroom: Classroom): Promise<void> {
  const cleaned = cleanupDuplicateStudentsInClassrooms([classroom])[0];
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error: classroomError } = await supabase
    .from('go_school_classrooms')
    .upsert(
      {
        id: cleaned.id,
        name: cleaned.name,
        max_capacity: cleaned.maxCapacity,
        updated_at: now,
      },
      { onConflict: 'id' },
    );
  if (classroomError) throw new Error(classroomError.message);

  const { error: clearError } = await supabase
    .from('go_school_students')
    .update({ classroom_id: null, classroom_position: null, updated_at: now })
    .eq('classroom_id', cleaned.id);
  if (clearError) throw new Error(clearError.message);

  await Promise.all(cleaned.studentIds.map((studentId, index) =>
    supabase
      .from('go_school_students')
      .update({ classroom_id: cleaned.id, classroom_position: index, updated_at: now })
      .eq('login_id', studentId)
      .then(({ error }) => {
        if (error) throw new Error(error.message);
      }),
  ));
}

export async function deleteClassroom(id: string): Promise<void> {
  const targetId = (id || '').trim();
  if (!targetId) return;
  const { error } = await getSupabase()
    .from('go_school_classrooms')
    .delete()
    .eq('id', targetId);
  if (error) throw new Error(error.message);
}

export async function importAll(students: Student[], classrooms: Classroom[]): Promise<void> {
  const cleanedClassrooms = cleanupDuplicateStudentsInClassrooms(classrooms);
  const wantedStudentIds = new Set(students.map(s => normalizeStudent(s).id).filter(Boolean));
  const wantedClassroomIds = new Set(cleanedClassrooms.map(c => c.id).filter(Boolean));
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const classroomRows = cleanedClassrooms.map(c => ({
    id: c.id,
    name: c.name,
    max_capacity: c.maxCapacity,
    updated_at: now,
  }));
  if (classroomRows.length > 0) {
    const { error } = await supabase.from('go_school_classrooms').upsert(classroomRows, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  const membership = new Map<string, { classroomId: string; position: number }>();
  for (const classroom of cleanedClassrooms) {
    classroom.studentIds.forEach((studentId, index) => {
      membership.set(studentId, { classroomId: classroom.id, position: index });
    });
  }

  const studentRows = students.map(s => {
    const normalized = normalizeStudent(s);
    const member = membership.get(normalized.id);
    return toStudentRow(normalized, member?.classroomId ?? null, member?.position ?? null);
  });
  if (studentRows.length > 0) {
    const { error } = await supabase.from('go_school_students').upsert(studentRows, { onConflict: 'login_id' });
    if (error) throw new Error(error.message);
  }

  const current = await fetchRoster();
  const staleStudentIds = current.students.map(s => s.id).filter(id => !wantedStudentIds.has(id));
  if (staleStudentIds.length > 0) {
    const { error } = await supabase.from('go_school_students').delete().in('login_id', staleStudentIds);
    if (error) throw new Error(error.message);
  }

  const staleClassroomIds = current.classrooms.map(c => c.id).filter(id => !wantedClassroomIds.has(id));
  if (staleClassroomIds.length > 0) {
    const { error } = await supabase.from('go_school_classrooms').delete().in('id', staleClassroomIds);
    if (error) throw new Error(error.message);
  }

  cacheRoster({ students: students.map(normalizeStudent), classrooms: cleanedClassrooms });
}

export async function migrateCachedRosterToSupabase(): Promise<ClassroomRoster> {
  const cached = loadCachedRoster();
  if (!hasRosterData(cached)) {
    throw new Error('移行できるローカル名簿がありません');
  }
  await importAll(cached.students, cached.classrooms);
  return fetchRoster();
}
