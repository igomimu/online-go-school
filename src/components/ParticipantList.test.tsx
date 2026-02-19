import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ParticipantList from './ParticipantList';
import type { ParticipantInfo } from '../utils/classroomLiveKit';

const participants: ParticipantInfo[] = [
  { identity: '三村先生', isSpeaking: false, audioEnabled: true, videoEnabled: false },
  { identity: 'たろう', isSpeaking: false, audioEnabled: false, videoEnabled: false },
];

describe('ParticipantList', () => {
  it('参加者名を表示する', () => {
    render(
      <ParticipantList
        participants={participants}
        localIdentity="三村先生"
        activeSpeakers={[]}
      />
    );
    expect(screen.getByText('三村先生')).toBeInTheDocument();
    expect(screen.getByText('たろう')).toBeInTheDocument();
  });

  it('自分に「(you)」を表示', () => {
    render(
      <ParticipantList
        participants={participants}
        localIdentity="三村先生"
        activeSpeakers={[]}
      />
    );
    expect(screen.getByText('(you)')).toBeInTheDocument();
  });

  it('参加者0人のとき何も表示しない', () => {
    const { container } = render(
      <ParticipantList
        participants={[]}
        localIdentity=""
        activeSpeakers={[]}
      />
    );
    expect(container.innerHTML).toBe('');
  });

  it('発話中の参加者にハイライトスタイル', () => {
    const { container } = render(
      <ParticipantList
        participants={participants}
        localIdentity="三村先生"
        activeSpeakers={['たろう']}
      />
    );
    const items = container.querySelectorAll('[class*="green-500"]');
    expect(items.length).toBeGreaterThanOrEqual(1);
  });
});
