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

export function saveClassrooms(classrooms: Classroom[]): void {
  localStorage.setItem(CLASSROOMS_KEY, JSON.stringify(classrooms));
}

export function addClassroom(classroom: Classroom): void {
  const classrooms = loadClassrooms();
  classrooms.push(classroom);
  saveClassrooms(classrooms);
}

export function updateClassroom(updated: Classroom): void {
  const classrooms = loadClassrooms().map(c => c.id === updated.id ? updated : c);
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
