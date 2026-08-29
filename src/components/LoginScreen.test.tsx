import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginScreen from './LoginScreen';
import { supabaseSignInStudent } from '../utils/authStore';

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
