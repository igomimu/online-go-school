import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginScreen from './LoginScreen';
import { loadAccounts, supabaseSignInStudent } from '../utils/authStore';

vi.mock('../utils/authStore', () => ({
  loadAccounts: vi.fn(() => []),
  saveAccount: vi.fn(),
  deleteAccount: vi.fn(),
  setTeacherPassword: vi.fn(),
  supabaseSignInStudent: vi.fn(),
  supabaseSignInTeacher: vi.fn(),
  supabaseSignOut: vi.fn(),
}));

vi.mock('../hooks/usePwaInstall', () => ({
  usePwaInstall: () => ({ canInstall: false, install: vi.fn() }),
}));

describe('子ども向け生徒ログイン', () => {
  beforeEach(() => vi.clearAllMocks());

  it('教室IDの手入力を求めず、複数所属なら教室名から選べる', async () => {
    vi.mocked(supabaseSignInStudent)
      .mockResolvedValueOnce({
        ok: false,
        requiresClassroomSelection: true,
        classrooms: [
          { id: 'CLASS-A', name: '月曜教室' },
          { id: 'CLASS-B', name: '土曜教室' },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        studentId: '1016',
        displayName: '鈴木 榛人',
        classroomId: 'CLASS-B',
      });
    const onStudentLogin = vi.fn();

    render(<LoginScreen onStudentLogin={onStudentLogin} onTeacherLogin={vi.fn()} />);
    expect(screen.queryByTestId('classroom-id-input')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('student-id-input'), { target: { value: '1016' } });
    fireEvent.click(screen.getByTestId('student-login-button'));

    expect(await screen.findByRole('button', { name: '月曜教室' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '土曜教室' }));

    await waitFor(() => expect(onStudentLogin).toHaveBeenCalledWith(
      '1016', 'CLASS-B', '1016', '鈴木 榛人',
    ));
  });

  it('単一所属でリンクが誤っていても補正後の教室へ入る', async () => {
    vi.mocked(supabaseSignInStudent).mockResolvedValue({
      ok: true,
      studentId: '1016',
      displayName: '鈴木 榛人',
      classroomId: 'CLASS-A',
      classroomCorrected: true,
    });
    const onStudentLogin = vi.fn();

    render(
      <LoginScreen
        prefilledClassroomId="WRONG"
        onStudentLogin={onStudentLogin}
        onTeacherLogin={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('student-id-input'), { target: { value: '1016' } });
    fireEvent.click(screen.getByTestId('student-login-button'));

    await waitFor(() => expect(onStudentLogin).toHaveBeenCalledWith(
      '1016', 'CLASS-A', '1016', '鈴木 榛人',
    ));
  });
});

describe('参加リンク（初めての大人向け）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('リンクを開いただけでその生徒としてログインする', async () => {
    vi.mocked(supabaseSignInStudent).mockResolvedValue({
      ok: true,
      studentId: '1020',
      displayName: '井町 太郎',
      classroomId: 'CLS1',
    });
    const onStudentLogin = vi.fn();

    render(
      <LoginScreen
        prefilledClassroomId="CLS1"
        prefilledStudentCode="1020"
        onStudentLogin={onStudentLogin}
        onTeacherLogin={vi.fn()}
      />,
    );

    // 何も押していないのに入れる
    await waitFor(() => expect(supabaseSignInStudent).toHaveBeenCalledWith('1020', 'CLS1'));
    await waitFor(() => expect(onStudentLogin).toHaveBeenCalledWith(
      '1020', 'CLS1', '1020', '井町 太郎',
    ));
    expect(supabaseSignInStudent).toHaveBeenCalledTimes(1);
  });

  it('自動ログインに失敗したら記入済みのログイン画面に留まり、押せば入れる', async () => {
    vi.mocked(supabaseSignInStudent)
      .mockResolvedValueOnce({ ok: false, error: '接続に失敗しました' })
      .mockResolvedValueOnce({
        ok: true,
        studentId: '1020',
        displayName: '井町 太郎',
        classroomId: 'CLS1',
      });
    const onStudentLogin = vi.fn();

    render(
      <LoginScreen
        prefilledClassroomId="CLS1"
        prefilledStudentCode="1020"
        onStudentLogin={onStudentLogin}
        onTeacherLogin={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('接続に失敗しました')).toBeVisible());
    expect((screen.getByTestId('student-id-input') as HTMLInputElement).value).toBe('1020');
    expect(screen.getByTestId('prefilled-notice')).toBeVisible();

    fireEvent.click(screen.getByTestId('student-login-button'));
    await waitFor(() => expect(onStudentLogin).toHaveBeenCalledWith(
      '1020', 'CLS1', '1020', '井町 太郎',
    ));
  });

  it('教室IDの無い古いリンクは自動ログインせず、記入だけして待つ', async () => {
    vi.mocked(supabaseSignInStudent).mockResolvedValue({ ok: true, studentId: '1020', displayName: '井町 太郎', classroomId: 'CLS1' });

    render(
      <LoginScreen
        prefilledStudentCode="1020"
        onStudentLogin={vi.fn()}
        onTeacherLogin={vi.fn()}
      />,
    );

    expect((screen.getByTestId('student-id-input') as HTMLInputElement).value).toBe('1020');
    expect(screen.getByTestId('prefilled-notice')).toBeVisible();
    await waitFor(() => expect(supabaseSignInStudent).not.toHaveBeenCalled());
  });

  it('端末に前の人の保存アカウントが残っていてもリンクのコードを上書きしない', () => {
    vi.mocked(supabaseSignInStudent).mockResolvedValue({ ok: false, error: 'dummy' });
    vi.mocked(loadAccounts).mockReturnValue([
      { studentId: '1001', classroomId: 'CLS1', studentName: '前の人', classroomName: '火曜クラス' },
    ]);

    render(
      <LoginScreen
        prefilledClassroomId="CLS1"
        prefilledStudentCode="1020"
        onStudentLogin={vi.fn()}
        onTeacherLogin={vi.fn()}
      />,
    );

    expect((screen.getByTestId('student-id-input') as HTMLInputElement).value).toBe('1020');
  });

  it('参加リンクが無いときは案内を出さない', () => {
    render(<LoginScreen onStudentLogin={vi.fn()} onTeacherLogin={vi.fn()} />);
    expect(screen.queryByTestId('prefilled-notice')).toBeNull();
  });
});
