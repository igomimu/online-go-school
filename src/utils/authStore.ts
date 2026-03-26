// 生徒ログイン情報のlocalStorage管理

const ACCOUNTS_KEY = 'go-school-accounts';
const TEACHER_PW_KEY = 'go-school-teacher-pw';

export interface SavedAccount {
  studentId: string;
  classroomId: string;
  studentName: string; // 先生側で解決された名前（初回は空）
  classroomName: string;
  lastUsed: number; // Date.now()
}

// === 生徒アカウント ===

export function loadAccounts(): SavedAccount[] {
  try {
    const data = localStorage.getItem(ACCOUNTS_KEY);
    if (!data) return [];
    return (JSON.parse(data) as SavedAccount[]).sort((a, b) => b.lastUsed - a.lastUsed);
  } catch {
    return [];
  }
}

/** upsert: 同じstudentId+classroomIdがあれば更新、なければ追加 */
export function saveAccount(
  studentId: string,
  classroomId: string,
  studentName: string = '',
  classroomName: string = '',
): void {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(
    a => a.studentId === studentId && a.classroomId === classroomId,
  );
  const entry: SavedAccount = {
    studentId,
    classroomId,
    studentName: studentName || accounts[idx]?.studentName || '',
    classroomName: classroomName || accounts[idx]?.classroomName || '',
    lastUsed: Date.now(),
  };
  if (idx >= 0) {
    accounts[idx] = entry;
  } else {
    accounts.push(entry);
  }
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function deleteAccount(studentId: string, classroomId: string): void {
  const accounts = loadAccounts().filter(
    a => !(a.studentId === studentId && a.classroomId === classroomId),
  );
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** 最後に使ったアカウント */
export function loadLastAccount(): SavedAccount | null {
  const accounts = loadAccounts();
  return accounts.length > 0 ? accounts[0] : null;
}

// === 先生パスワード ===

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hasTeacherPassword(): boolean {
  return !!localStorage.getItem(TEACHER_PW_KEY);
}

export async function setTeacherPassword(password: string): Promise<void> {
  localStorage.setItem(TEACHER_PW_KEY, await sha256(password));
}

export async function verifyTeacherPassword(password: string): Promise<boolean> {
  const stored = localStorage.getItem(TEACHER_PW_KEY);
  if (!stored) return false;
  return stored === await sha256(password);
}

export function resetTeacherPassword(): void {
  localStorage.removeItem(TEACHER_PW_KEY);
}
