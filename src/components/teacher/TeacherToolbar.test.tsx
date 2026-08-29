import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TeacherToolbar from './TeacherToolbar';

function renderToolbar(overrides: Partial<React.ComponentProps<typeof TeacherToolbar>> = {}) {
  const props: React.ComponentProps<typeof TeacherToolbar> = {
    studentJoinInfo: '',
    onCreateGame: vi.fn(),
    onStartLecture: vi.fn(),
    onLoadSgf: vi.fn(),
    onDisconnect: vi.fn(),
    onReconnect: vi.fn(),
    isReconnecting: false,
    onOpenStudentManager: vi.fn(),
    ...overrides,
  };
  render(<TeacherToolbar {...props} />);
  return props;
}

describe('TeacherToolbar 一括操作', () => {
  it('参加生徒がいるとM・S・共有の各処理を呼ぶ', () => {
    const onClearAudioM = vi.fn();
    const onClearAudioS = vi.fn();
    const onClearSharing = vi.fn();
    renderToolbar({ hasConnectedStudents: true, onClearAudioM, onClearAudioS, onClearSharing });

    fireEvent.click(screen.getByRole('button', { name: '音声Mをクリア' }));
    fireEvent.click(screen.getByRole('button', { name: '音声Sをクリア' }));
    fireEvent.click(screen.getByRole('button', { name: '共有を全員に' }));

    expect(onClearAudioM).toHaveBeenCalledOnce();
    expect(onClearAudioS).toHaveBeenCalledOnce();
    expect(onClearSharing).toHaveBeenCalledOnce();
  });

  it('参加生徒がいないと3ボタンを無効にする', () => {
    renderToolbar();

    expect(screen.getByRole('button', { name: '音声Mをクリア' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '音声Sをクリア' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '共有を全員に' })).toBeDisabled();
  });
});
