import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// LiveKitのConnectionStateをモック
vi.mock('livekit-client', () => ({
  ConnectionState: {
    Connected: 'connected',
    Reconnecting: 'reconnecting',
    Disconnected: 'disconnected',
  },
}));

import Header from './Header';

describe('Header', () => {
  const defaultProps = {
    role: 'TEACHER' as const,
    userName: '三村先生',
    connectionState: 'connected' as const,
    remoteCount: 5,
    isMicEnabled: true,
    onToggleMic: vi.fn(),
    isMuted: false,
    onToggleMute: vi.fn(),
    onDisconnect: vi.fn(),
  };

  it('先生の名前と役割を表示', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('先生')).toBeInTheDocument();
    expect(screen.getByText('三村先生')).toBeInTheDocument();
  });

  it('生徒の役割を表示', () => {
    render(<Header {...defaultProps} role="STUDENT" userName="たろう" />);
    expect(screen.getByText('生徒')).toBeInTheDocument();
    expect(screen.getByText('たろう')).toBeInTheDocument();
  });

  it('接続中に人数を表示', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByText('5人接続中')).toBeInTheDocument();
  });

  it('接続中にマイクボタンが表示される', () => {
    render(<Header {...defaultProps} />);
    expect(screen.getByTitle('マイクOFF')).toBeInTheDocument();
  });

  it('マイクOFF状態', () => {
    render(<Header {...defaultProps} isMicEnabled={false} />);
    expect(screen.getByTitle('マイクON')).toBeInTheDocument();
  });

  it('マイクボタンクリック', () => {
    const onToggleMic = vi.fn();
    render(<Header {...defaultProps} onToggleMic={onToggleMic} />);
    fireEvent.click(screen.getByTitle('マイクOFF'));
    expect(onToggleMic).toHaveBeenCalled();
  });

  it('ミュートボタン', () => {
    const onToggleMute = vi.fn();
    render(<Header {...defaultProps} onToggleMute={onToggleMute} />);
    fireEvent.click(screen.getByTitle('音声OFF'));
    expect(onToggleMute).toHaveBeenCalled();
  });

  it('切断ボタン', () => {
    const onDisconnect = vi.fn();
    render(<Header {...defaultProps} onDisconnect={onDisconnect} />);
    fireEvent.click(screen.getByTitle('切断'));
    expect(onDisconnect).toHaveBeenCalled();
  });

  it('未接続時はマイク/ミュートボタンが非表示', () => {
    render(<Header {...defaultProps} connectionState={'disconnected' as never} />);
    expect(screen.queryByTitle('マイクOFF')).not.toBeInTheDocument();
    expect(screen.queryByTitle('音声OFF')).not.toBeInTheDocument();
  });

  it('カメラボタン（オプション）', () => {
    const onToggleCamera = vi.fn();
    render(<Header {...defaultProps} isCameraEnabled={true} onToggleCamera={onToggleCamera} />);
    fireEvent.click(screen.getByTitle('カメラOFF'));
    expect(onToggleCamera).toHaveBeenCalled();
  });
});
