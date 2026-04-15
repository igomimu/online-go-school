import type { Page } from '@playwright/test';
import { TEST_CLASSROOM_NAME, TEST_STUDENT_A, TEST_STUDENT_B } from './test-data';

export async function clearAllData(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}

export async function setupTeacherPassword(page: Page, password: string): Promise<void> {
  await page.evaluate(async (pw) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('go-school-teacher-pw', hash);
  }, password);
}

/**
 * 生徒A+B登録済み、指定classroomIdに両方所属した教室データを localStorage に書き込む。
 * classroomId をテストごとに変えることで、同一LiveKit Room上でのstate混在を避ける。
 */
export async function setupClassroomData(page: Page, classroomId: string): Promise<void> {
  await page.evaluate(({ students, classrooms }) => {
    localStorage.setItem('go-school-students', JSON.stringify(students));
    localStorage.setItem('go-school-classrooms', JSON.stringify(classrooms));
  }, {
    students: [
      { id: TEST_STUDENT_A.id, name: TEST_STUDENT_A.name, rank: TEST_STUDENT_A.rank, internalRating: '', type: 'ネット生', grade: '', country: '' },
      { id: TEST_STUDENT_B.id, name: TEST_STUDENT_B.name, rank: TEST_STUDENT_B.rank, internalRating: '', type: 'ネット生', grade: '', country: '' },
    ],
    classrooms: [
      { id: classroomId, name: TEST_CLASSROOM_NAME, maxCapacity: 10, studentIds: [TEST_STUDENT_A.id, TEST_STUDENT_B.id] },
    ],
  });
}
