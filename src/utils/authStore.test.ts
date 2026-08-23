import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabase } from './liveGameApi';
import { supabaseSignInStudent } from './authStore';

vi.mock('./liveGameApi', () => ({
  functionsBaseUrl: () => 'https://example.test/functions/v1',
  getSupabase: vi.fn(),
}));

function installAuthMock() {
  const signOut = vi.fn(async () => ({}));
  vi.mocked(getSupabase).mockReturnValue({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      signInAnonymously: vi.fn(async () => ({
        data: { session: { access_token: 'anon-token' } },
        error: null,
      })),
      refreshSession: vi.fn(async () => ({ error: null })),
      signOut,
    },
  } as never);
  return { signOut };
}

describe('生徒ログインの教室所属解決', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('複数所属でリンク指定が無効なら教室選択肢を返す', async () => {
    const { signOut } = installAuthMock();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 'classroom_selection_required',
      classrooms: [
        { id: 'CLASS-A', name: '月曜教室' },
        { id: 'CLASS-B', name: '土曜教室' },
      ],
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })));

    const result = await supabaseSignInStudent('1016', 'WRONG');

    expect(result).toMatchObject({
      ok: false,
      requiresClassroomSelection: true,
      classrooms: [
        { id: 'CLASS-A', name: '月曜教室' },
        { id: 'CLASS-B', name: '土曜教室' },
      ],
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it('単一所属ならサーバーが補正した正しい教室を使う', async () => {
    installAuthMock();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      student_id: '1016',
      display_name: '鈴木 榛人',
      classroom_id: 'CLASS-A',
      classroom_name: '月曜教室',
      classroom_corrected: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const result = await supabaseSignInStudent('1016', 'WRONG');

    expect(result).toMatchObject({
      ok: true,
      studentId: '1016',
      classroomId: 'CLASS-A',
      classroomName: '月曜教室',
      classroomCorrected: true,
    });
  });
});
