import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MediaControlPanel from './MediaControlPanel';
import type { ParticipantInfo } from '../utils/classroomLiveKit';
import type { AudioPermissions } from '../types/game';

const students: ParticipantInfo[] = [
  { identity: 'たろう', isSpeaking: false, audioEnabled: true, videoEnabled: false },
  { identity: 'はなこ', isSpeaking: false, audioEnabled: false, videoEnabled: false },
];

const allParticipants: ParticipantInfo[] = [
  { identity: '三村先生', isSpeaking: false, audioEnabled: true, videoEnabled: false },
  ...students,
];

describe('MediaControlPanel', () => {
  it('生徒がいないとメッセージ表示', () => {
    render(
      <MediaControlPanel
        participants={[{ identity: '三村先生', isSpeaking: false, audioEnabled: true, videoEnabled: false }]}
        localIdentity="三村先生"
        audioPermissions={{}}
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
      />
    );
    expect(screen.getByText('生徒が接続されていません')).toBeInTheDocument();
  });

  it('先生自身は除外して生徒のみ表示', () => {
    render(
      <MediaControlPanel
        participants={allParticipants}
        localIdentity="三村先生"
        audioPermissions={{}}
        onToggleHear={vi.fn()}
        onToggleMic={vi.fn()}
      />
    );
    expect(screen.getByText('たろう')).toBeInTheDocument();
    expect(screen.getByText('はなこ')).toBeInTheDocument();
    expect(screen.queryByText('三村先生')).not.toBeInTheDocument();
  });

  it('音声配信トグルをクリック', () => {
    const onToggleHear = vi.fn();
    const perms: AudioPermissions = {
      'たろう': { canHear: true, micAllowed: true, cameraAllowed: true },
    };
    render(
      <MediaControlPanel
        participants={allParticipants}
        localIdentity="三村先生"
        audioPermissions={perms}
        onToggleHear={onToggleHear}
        onToggleMic={vi.fn()}
      />
    );
    const hearBtns = screen.getAllByTitle('音声配信中');
    fireEvent.click(hearBtns[0]);
    expect(onToggleHear).toHaveBeenCalledWith('たろう');
  });

  it('マイク許可トグルをクリック', () => {
    const onToggleMic = vi.fn();
    const perms: AudioPermissions = {
      'たろう': { canHear: true, micAllowed: true, cameraAllowed: true },
    };
    render(
      <MediaControlPanel
        participants={allParticipants}
        localIdentity="三村先生"
        audioPermissions={perms}
        onToggleHear={vi.fn()}
        onToggleMic={onToggleMic}
      />
    );
    const micBtns = screen.getAllByTitle('マイク許可中');
    fireEvent.click(micBtns[0]);
    expect(onToggleMic).toHaveBeenCalledWith('たろう');
  });
});
