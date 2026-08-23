import type { Student, Classroom, RankDisplay, StudentTypeDraft } from '../types/classroom';
import { DEFAULT_RANK_DISPLAY, DEFAULT_STUDENT_TYPES, normalizeStudentTypes } from '../types/classroom';
import { getSupabase } from './liveGameApi';
import { isGuestTeacher } from './authStore';

// ゲスト先生を閉じ込めるデモ教室。Edge Function validate_teacher_session と同じ値。
export const DEMO_CLASSROOM_ID = 'DEMO01';

const STUDENTS_KEY = 'go-school-students';
const CLASSROOMS_KEY = 'go-school-classrooms';
const STUDENT_TYPES_KEY = 'go-school-student-types';

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
  rank_display?: string | null;
  roster_token?: string | null;
};

type GoSchoolMembershipRow = {
  classroom_id: string;
  student_login_id: string;
  classroom_position: number | null;
};

type GoSchoolStudentTypeRow = {
  name: string;
  display_order: number;
};

export interface ClassroomRoster {
  students: Student[];
  classrooms: Classroom[];
  studentTypes: string[];
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
  localStorage.setItem(STUDENT_TYPES_KEY, JSON.stringify(roster.studentTypes));
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

// E2E/テスト実行が本番DBに残す教室を教師UIから除外する。
// （名前が先頭ソートされ自動選択→0名教室で生徒リスト・対局同期が出ない事故を防ぐ）
export function isTestClassroom(id: string | null | undefined, name: string | null | undefined): boolean {
  const idStr = (id || '').toLowerCase();
  if (/^(debugfull|verify|wiring|test-class|e2e|debug|smoke)[-_]/.test(idStr)) return true;
  const nameStr = name || '';
  if (nameStr.startsWith('E2Eテスト教室') || /(^|\s)(E2E|test|debug)/i.test(nameStr)) return true;
  return false;
}

// E2E実行中のブラウザだけは、自分がシードしたテスト教室を見える必要がある。
// setupClassroomData が書き込む go-school-e2e-classroom-id をopt-inの許可IDとして扱う。
// 実運用ブラウザにはこのキーが存在しないため、除外フィルタの挙動は変わらない。
function e2eAllowedClassroomId(): string | null {
  try {
    return localStorage.getItem('go-school-e2e-classroom-id');
  } catch {
    return null;
  }
}

function buildRoster(
  studentRows: GoSchoolStudentRow[],
  classroomRows: GoSchoolClassroomRow[],
  membershipRows: GoSchoolMembershipRow[],
  studentTypeRows: GoSchoolStudentTypeRow[],
): ClassroomRoster {
  // ゲスト（デモ見学）先生にはデモ教室とその所属生徒だけを見せる。
  // 名簿・教室セレクタ・生徒一覧はすべてこの roster 由来なので、ここで絞れば実データは出ない。
  if (isGuestTeacher()) {
    const demoStudentIds = new Set(
      membershipRows.filter(row => row.classroom_id === DEMO_CLASSROOM_ID).map(row => row.student_login_id),
    );
    studentRows = studentRows.filter(row => demoStudentIds.has(row.login_id));
    membershipRows = membershipRows.filter(row => row.classroom_id === DEMO_CLASSROOM_ID);
    classroomRows = classroomRows.filter(row => row.id === DEMO_CLASSROOM_ID);
    return buildRosterRows(studentRows, classroomRows, membershipRows, studentTypeRows);
  }

  const allowedId = e2eAllowedClassroomId();
  classroomRows = classroomRows.filter(row => (allowedId !== null && row.id === allowedId) || !isTestClassroom(row.id, row.name));
  const visibleClassroomIds = new Set(classroomRows.map(row => row.id));
  membershipRows = membershipRows.filter(row => visibleClassroomIds.has(row.classroom_id));
  return buildRosterRows(studentRows, classroomRows, membershipRows, studentTypeRows);
}

function buildRosterRows(
  studentRows: GoSchoolStudentRow[],
  classroomRows: GoSchoolClassroomRow[],
  membershipRows: GoSchoolMembershipRow[],
  studentTypeRows: GoSchoolStudentTypeRow[],
): ClassroomRoster {
  const students = studentRows
    .map(toStudent)
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const studentById = new Map(studentRows.map(row => [row.login_id, row]));
  const membersByClassroom = new Map<string, Array<{ student: GoSchoolStudentRow; position: number | null }>>();
  for (const membership of membershipRows) {
    const student = studentById.get(membership.student_login_id);
    if (!student) continue;
    const list = membersByClassroom.get(membership.classroom_id) ?? [];
    list.push({ student, position: membership.classroom_position });
    membersByClassroom.set(membership.classroom_id, list);
  }

  const classrooms = classroomRows
    .map(row => {
      const members = membersByClassroom.get(row.id) ?? [];
      members.sort((a, b) => {
        const posA = a.position ?? Number.MAX_SAFE_INTEGER;
        const posB = b.position ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;
        return (a.student.name || a.student.login_id).localeCompare(b.student.name || b.student.login_id, 'ja');
      });
      return {
        id: row.id,
        name: row.name || row.id,
        maxCapacity: row.max_capacity || 10,
        studentIds: members.map(member => member.student.login_id),
        rankDisplay: row.rank_display === 'rating' ? 'rating' as const : DEFAULT_RANK_DISPLAY,
        // 共有PCの鍵はサーバーが発行する。教室の保存で消してしまわないよう読むだけにする
        rosterToken: row.roster_token ?? undefined,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));

  const configuredTypes = studentTypeRows
    .sort((a, b) => a.display_order - b.display_order)
    .map(row => row.name);
  // 移行前などマスター外の値も選択肢から消さず、既存生徒を編集可能に保つ。
  const assignedTypes = students.map(student => student.type);
  const studentTypes = normalizeStudentTypes([
    ...(configuredTypes.length > 0 ? configuredTypes : DEFAULT_STUDENT_TYPES),
    ...assignedTypes,
  ]);

  return { students, classrooms, studentTypes };
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

export function loadStudentTypes(): string[] {
  return normalizeStudentTypes(readJson<string[]>(STUDENT_TYPES_KEY, [...DEFAULT_STUDENT_TYPES]));
}

export function loadCachedRoster(): ClassroomRoster {
  return { students: loadStudents(), classrooms: loadClassrooms(), studentTypes: loadStudentTypes() };
}

// 重複登録を自動検知して排除するクリーンアップヘルパー
export function cleanupDuplicateStudentsInClassrooms(classrooms: Classroom[]): Classroom[] {
  return classrooms.map(c => {
    const seenStudentIds = new Set<string>();
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
  const [
    { data: studentRows, error: studentsError },
    { data: classroomRows, error: classroomsError },
    { data: membershipRows, error: membershipsError },
    { data: studentTypeRows, error: studentTypesError },
  ] = await Promise.all([
    supabase
      .from('go_school_students')
      .select('login_id,name,classroom_id,classroom_position,rank,internal_rating,student_type,grade,country,birthdate')
      .order('name', { ascending: true }),
    supabase
      .from('go_school_classrooms')
      .select('id,name,max_capacity,rank_display,roster_token')
      .order('name', { ascending: true }),
    supabase
      .from('go_school_classroom_memberships')
      .select('classroom_id,student_login_id,classroom_position'),
    supabase
      .from('go_school_student_types')
      .select('name,display_order')
      .order('display_order', { ascending: true }),
  ]);

  if (studentsError) throw new Error(studentsError.message);
  if (classroomsError) throw new Error(classroomsError.message);
  if (membershipsError) throw new Error(membershipsError.message);
  if (studentTypesError) throw new Error(studentTypesError.message);

  const roster = buildRoster(
    (studentRows ?? []) as GoSchoolStudentRow[],
    (classroomRows ?? []) as GoSchoolClassroomRow[],
    (membershipRows ?? []) as GoSchoolMembershipRow[],
    (studentTypeRows ?? []) as GoSchoolStudentTypeRow[],
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
  let previousMemberships: GoSchoolMembershipRow[] = [];

  if (previousId && previousId !== normalized.id) {
    const [{ data: existing, error: existingError }, { data: previous, error: previousError }] = await Promise.all([
      supabase
        .from('go_school_students')
        .select('login_id')
        .eq('login_id', normalized.id)
        .maybeSingle(),
      supabase
        .from('go_school_classroom_memberships')
        .select('classroom_id,student_login_id,classroom_position')
        .eq('student_login_id', previousId),
    ]);

    if (existingError) throw new Error(existingError.message);
    if (previousError) throw new Error(previousError.message);
    if (existing) throw new Error(`生徒ID「${normalized.id}」は既に使われています`);

    previousMemberships = (previous ?? []) as GoSchoolMembershipRow[];
  }

  const row = toStudentProfileRow(normalized);

  const { error } = await supabase
    .from('go_school_students')
    .upsert(row, { onConflict: 'login_id' });
  if (error) throw new Error(error.message);

  if (previousId && previousId !== normalized.id) {
    if (previousMemberships.length > 0) {
      const { error: membershipError } = await supabase
        .from('go_school_classroom_memberships')
        .upsert(previousMemberships.map(membership => ({
          classroom_id: membership.classroom_id,
          student_login_id: normalized.id,
          classroom_position: membership.classroom_position,
          updated_at: new Date().toISOString(),
        })), { onConflict: 'classroom_id,student_login_id' });
      if (membershipError) throw new Error(membershipError.message);
    }
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

export async function deleteStudents(ids: string[]): Promise<void> {
  const targetIds = ids.map(id => (id || '').trim()).filter(Boolean);
  if (targetIds.length === 0) return;
  const { error } = await getSupabase()
    .from('go_school_students')
    .delete()
    .in('login_id', targetIds);
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

export async function replaceStudentTypes(entries: StudentTypeDraft[]): Promise<void> {
  const normalized = entries.map(entry => ({
    originalName: entry.originalName,
    name: entry.name.trim(),
  }));
  const names = normalizeStudentTypes(normalized.map(entry => entry.name));
  if (names.length === 0) throw new Error('生徒区分を1つ以上入力してください');
  if (names.length !== normalized.length) throw new Error('空欄または同じ名前の生徒区分があります');

  const { error } = await getSupabase().rpc('replace_go_school_student_types', {
    p_entries: normalized.map((entry, position) => ({
      original_name: entry.originalName,
      name: entry.name,
      position,
    })),
  });
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
        rank_display: cleaned.rankDisplay ?? DEFAULT_RANK_DISPLAY,
        updated_at: now,
      },
      { onConflict: 'id' },
    );
  if (classroomError) throw new Error(classroomError.message);

  const { error: clearError } = await supabase
    .from('go_school_classroom_memberships')
    .delete()
    .eq('classroom_id', cleaned.id);
  if (clearError) throw new Error(clearError.message);

  if (cleaned.studentIds.length > 0) {
    const { error: membershipError } = await supabase
      .from('go_school_classroom_memberships')
      .upsert(cleaned.studentIds.map((studentId, index) => ({
        classroom_id: cleaned.id,
        student_login_id: studentId,
        classroom_position: index,
        updated_at: now,
      })), { onConflict: 'classroom_id,student_login_id' });
    if (membershipError) throw new Error(membershipError.message);
  }
}

/** 授業中の表示切替用。名簿の所属や並び順には触れず、棋力表示だけを更新する。 */
export async function updateClassroomRankDisplay(
  classroomId: string,
  rankDisplay: RankDisplay,
): Promise<void> {
  const targetId = classroomId.trim();
  if (!targetId) throw new Error('教室が選択されていません');

  const { error } = await getSupabase()
    .from('go_school_classrooms')
    .update({
      rank_display: rankDisplay,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetId);
  if (error) throw new Error(error.message);
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
    rank_display: c.rankDisplay ?? DEFAULT_RANK_DISPLAY,
    updated_at: now,
  }));
  if (classroomRows.length > 0) {
    const { error } = await supabase.from('go_school_classrooms').upsert(classroomRows, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  const studentRows = students.map(s => toStudentProfileRow(normalizeStudent(s)));
  if (studentRows.length > 0) {
    const { error } = await supabase.from('go_school_students').upsert(studentRows, { onConflict: 'login_id' });
    if (error) throw new Error(error.message);
  }

  const membershipRows = cleanedClassrooms.flatMap(classroom =>
    classroom.studentIds.map((studentId, index) => ({
      classroom_id: classroom.id,
      student_login_id: studentId,
      classroom_position: index,
      updated_at: now,
    })),
  );
  if (wantedClassroomIds.size > 0) {
    const { error } = await supabase
      .from('go_school_classroom_memberships')
      .delete()
      .in('classroom_id', [...wantedClassroomIds]);
    if (error) throw new Error(error.message);
  }
  if (membershipRows.length > 0) {
    const { error } = await supabase
      .from('go_school_classroom_memberships')
      .upsert(membershipRows, { onConflict: 'classroom_id,student_login_id' });
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

  cacheRoster({
    students: students.map(normalizeStudent),
    classrooms: cleanedClassrooms,
    studentTypes: loadStudentTypes(),
  });
}

export async function migrateCachedRosterToSupabase(): Promise<ClassroomRoster> {
  const cached = loadCachedRoster();
  if (!hasRosterData(cached)) {
    throw new Error('移行できるローカル名簿がありません');
  }
  await importAll(cached.students, cached.classrooms);
  return fetchRoster();
}
