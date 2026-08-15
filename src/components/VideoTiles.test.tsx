import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VideoTiles from './VideoTiles';
import type { ParticipantInfo } from '../utils/classroomLiveKit';

const participants: ParticipantInfo[] = [
  { identity: 'teacher', name: '三村九段', isSpeaking: false, audioEnabled: true, videoEnabled: true },
  { identity: 'sid:1004', name: '金子 大地', isSpeaking: false, audioEnabled: true, videoEnabled: true },
];

describe('VideoTiles', () => {
  it('講師画面では本人を先頭にして、横スクロール可能な大きい映像を並べる', () => {
    const teacherVideo = document.createElement('video');
    const studentVideo = document.createElement('video');

    render(
      <VideoTiles
        videoElements={new Map([
          ['sid:1004', studentVideo],
          ['teacher', teacherVideo],
        ])}
        localIdentity="teacher"
        participants={participants}
        variant="classroom"
      />,
    );

    const strip = screen.getByLabelText('参加者映像');
    expect(strip).toHaveClass('overflow-x-auto');
    expect(strip.firstElementChild).toHaveClass('justify-start');

    const videos = strip.querySelectorAll('video');
    expect(videos).toHaveLength(2);
    expect(videos[0]).toBe(teacherVideo);
    expect(videos[1]).toBe(studentVideo);
    expect(teacherVideo.parentElement).toHaveClass('[&>video]:object-contain');
    expect(screen.getByText('自分')).toBeInTheDocument();
    expect(screen.getByText('金子 大地')).toBeInTheDocument();
  });

  it('全画面ボタンで選んだ参加者の映像だけを拡大する', () => {
    const studentVideo = document.createElement('video');
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(studentVideo, 'requestFullscreen', { value: requestFullscreen });

    render(
      <VideoTiles
        videoElements={new Map([['sid:1004', studentVideo]])}
        localIdentity="teacher"
        participants={participants}
        variant="classroom"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '金子 大地の映像を全画面表示' }));
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });

  it('映像がない時は参加者映像の空枠を表示しない', () => {
    render(
      <VideoTiles
        videoElements={new Map()}
        localIdentity="teacher"
        variant="classroom"
      />,
    );

    expect(screen.queryByLabelText('参加者映像')).not.toBeInTheDocument();
  });
});
