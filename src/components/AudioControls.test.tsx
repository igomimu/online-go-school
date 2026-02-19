import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AudioControls from './AudioControls';

describe('AudioControls', () => {
  it('マイクON状態でクリックするとonToggleMicが呼ばれる', () => {
    const onToggleMic = vi.fn();
    render(
      <AudioControls
        isMicEnabled={true}
        onToggleMic={onToggleMic}
        isMuted={false}
        onToggleMute={vi.fn()}
      />
    );
    const micBtn = screen.getByTitle('Mute microphone');
    fireEvent.click(micBtn);
    expect(onToggleMic).toHaveBeenCalled();
  });

  it('マイクOFF状態のタイトル', () => {
    render(
      <AudioControls
        isMicEnabled={false}
        onToggleMic={vi.fn()}
        isMuted={false}
        onToggleMute={vi.fn()}
      />
    );
    expect(screen.getByTitle('Unmute microphone')).toBeInTheDocument();
  });

  it('ミュートボタン', () => {
    const onToggleMute = vi.fn();
    render(
      <AudioControls
        isMicEnabled={true}
        onToggleMic={vi.fn()}
        isMuted={false}
        onToggleMute={onToggleMute}
      />
    );
    const muteBtn = screen.getByTitle('Mute audio');
    fireEvent.click(muteBtn);
    expect(onToggleMute).toHaveBeenCalled();
  });

  it('ミュート中のタイトル', () => {
    render(
      <AudioControls
        isMicEnabled={true}
        onToggleMic={vi.fn()}
        isMuted={true}
        onToggleMute={vi.fn()}
      />
    );
    expect(screen.getByTitle('Unmute audio')).toBeInTheDocument();
  });
});
