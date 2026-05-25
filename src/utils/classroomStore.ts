import type { Student, Classroom } from '../types/classroom';

const STUDENTS_KEY = 'go-school-students';
const CLASSROOMS_KEY = 'go-school-classrooms';

// === 生徒 CRUD ===

export function loadStudents(): Student[] {
  try {
    const data = localStorage.getItem(STUDENTS_KEY);
    if (!data) return [];
    return JSON.parse(data) as Student[];
  } catch {
    return [];
  }
}

export function saveStudents(students: Student[]): void {
  localStorage.setItem(STUDENTS_KEY, JSON.stringify(students));
}

export function addStudent(student: Student): void {
  const students = loadStudents();
  students.push(student);
  saveStudents(students);
}

export function updateStudent(updated: Student): void {
  const students = loadStudents().map(s => s.id === updated.id ? updated : s);
  saveStudents(students);
}

export function deleteStudent(id: string): void {
  saveStudents(loadStudents().filter(s => s.id !== id));
  // 教室からも削除
  const classrooms = loadClassrooms().map(c => ({
    ...c,
    studentIds: c.studentIds.filter(sid => sid !== id),
  }));
  saveClassrooms(classrooms);
}

export function getStudent(id: string): Student | undefined {
  return loadStudents().find(s => s.id === id);
}

// === 教室 CRUD ===

export function loadClassrooms(): Classroom[] {
  try {
    const data = localStorage.getItem(CLASSROOMS_KEY);
    if (!data) return [];
    return JSON.parse(data) as Classroom[];
  } catch {
    return [];
  }
}

// 重複登録を自動検知して排除するクリーンアップヘルパー
export function cleanupDuplicateStudentsInClassrooms(classrooms: Classroom[]): Classroom[] {
  const seenStudentIds = new Set<string>();
  return classrooms.map(c => {
    const uniqueStudentIds = c.studentIds.filter(sid => {
      if (seenStudentIds.has(sid)) {
        return false;
      }
      seenStudentIds.add(sid);
      return true;
    });
    return { ...c, studentIds: uniqueStudentIds };
  });
}

export function saveClassrooms(classrooms: Classroom[]): void {
  // 保存時に重複を自動排除
  const cleaned = cleanupDuplicateStudentsInClassrooms(classrooms);
  localStorage.setItem(CLASSROOMS_KEY, JSON.stringify(cleaned));
}

export function addClassroom(classroom: Classroom): void {
  const classrooms = loadClassrooms();
  classrooms.push(classroom);
  saveClassrooms(classrooms);
}

export function updateClassroom(updated: Classroom): void {
  // 排他所属（リアルタイム移動）: 更新対象の教室に含まれている生徒は、他のすべての教室から自動削除する
  const classrooms = loadClassrooms().map(c => {
    if (c.id === updated.id) {
      return updated;
    }
    return {
      ...c,
      studentIds: c.studentIds.filter(sid => !updated.studentIds.includes(sid)),
    };
  });
  saveClassrooms(classrooms);
}

export function deleteClassroom(id: string): void {
  saveClassrooms(loadClassrooms().filter(c => c.id !== id));
}

export function getClassroom(id: string): Classroom | undefined {
  return loadClassrooms().find(c => c.id === id);
}

// === 一括インポート（既存データを上書き） ===

export function importAll(students: Student[], classrooms: Classroom[]): void {
  saveStudents(students);
  saveClassrooms(classrooms);
}
