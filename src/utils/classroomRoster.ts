import { functionsBaseUrl } from './liveGameApi';

/**
 * 道場の共有PC用の名簿（2026-08-13 三村さん）。
 *
 * 道場に通う生徒もネット道場に参加するので、据え置きのPCでは
 * IDを打たずに名前を選ぶだけで入れるようにする。
 *
 * 名簿は先生のJWTでしか読めない（RLS）ため Edge Function 経由で取る。
 * 鍵は教室IDではなく roster_token。教室IDは招待リンクに入っていて
 * 生徒全員が持っているので、それだけで氏名一覧が引けてはいけない。
 */

export interface RosterEntry {
  studentCode: string;
  name: string;
}

export interface ClassroomRoster {
  classroomId: string;
  classroomName: string;
  students: RosterEntry[];
}

export async function fetchClassroomRoster(rosterToken: string): Promise<ClassroomRoster> {
  const res = await fetch(`${functionsBaseUrl()}/list_classroom_roster`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rosterToken }),
  });

  if (!res.ok) {
    if (res.status === 404 || res.status === 400) {
      throw new Error('この共有PCの設定が無効です。先生にリンクを作り直してもらってください。');
    }
    throw new Error('名簿を取得できませんでした。通信の状態を確かめてください。');
  }

  const data = await res.json();
  if (!Array.isArray(data?.students)) {
    throw new Error('名簿を取得できませんでした。');
  }
  return {
    classroomId: String(data.classroomId ?? ''),
    classroomName: String(data.classroomName ?? data.classroomId ?? ''),
    students: data.students.map((s: { studentCode?: string; name?: string }) => ({
      studentCode: String(s.studentCode ?? ''),
      name: String(s.name ?? s.studentCode ?? ''),
    })).filter((s: RosterEntry) => s.studentCode),
  };
}

/** 共有PC用リンク。先生がこれをブックマークして道場のPCに置く */
export function buildRosterUrl(rosterToken: string, origin = window.location.origin): string {
  return `${origin}/?roster=${encodeURIComponent(rosterToken)}`;
}
