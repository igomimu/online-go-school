import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoTiles from './VideoTiles';
import type { ParticipantInfo } from '../utils/classroomLiveKit';
import { saveMirrorLocalVideo } from '../utils/mediaDevices';

const participants: ParticipantInfo[] = [
  { identity: 'teacher', name: '三村九段', isSpeaking: false, audioEnabled: true, videoEnabled: true },
  { identity: 'sid:1004', name: '金子 大地', isSpeaking: false, audioEnabled: true, videoEnabled: true },
];

/** LiveKit が作る <video> の代わり */
const videoEl = () => document.createElement('video');

const participant = (
  identity: string,
  name: string,
  state: Partial<ParticipantInfo> = {},
): ParticipantInfo => ({
  identity,
  name,
  isSpeaking: false,
  audioEnabled: true,
  videoEnabled: true,
  ...state,
});

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

  it('講師が映像列を広げた高さに合わせ、16対9のままタイルを拡大する', () => {
    const studentVideo = document.createElement('video');
    render(
      <VideoTiles
        videoElements={new Map([['sid:1004', studentVideo]])}
        localIdentity="teacher"
        participants={participants}
        variant="classroom"
        classroomTileHeight={180}
      />,
    );

    const tile = studentVideo.parentElement?.parentElement as HTMLElement;
    expect(tile).toHaveStyle({ height: '180px', width: '320px' });
    expect(studentVideo.parentElement).toHaveClass('[&>video]:object-contain');
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

  // ここから: マイク・カメラのオン/オフを子どもに分かる形で出す（2026-08-16）
  const remoteOnly = () => new Map([['sid:2000', videoEl()]]);

  it('一度もカメラを点けていないと、代わりに「カメラ オフ」の枠が出る', () => {
    render(
      <VideoTiles
        videoElements={remoteOnly()}
        localIdentity="sid:1000"
        isCameraEnabled={false}
      />,
    );
    expect(screen.getByText('カメラ オフ')).toBeInTheDocument();
  });

  it('カメラを止めた人のタイルは黒いままにせず「カメラ オフ」を被せる', () => {
    const elements = remoteOnly();
    elements.set('sid:1000', videoEl());
    render(
      <VideoTiles
        videoElements={elements}
        localIdentity="sid:1000"
        isCameraEnabled={false}
        participants={[
          participant('sid:1000', 'たろう', { videoEnabled: false }),
          participant('sid:2000', '三村九段'),
        ]}
      />,
    );
    // 自分のタイル1つぶんだけ（枠の重ね置きは出さない）
    expect(screen.getAllByText('カメラ オフ')).toHaveLength(1);
  });

  it('講師画面でもカメラを止めた生徒に「カメラ オフ」を被せる', () => {
    render(
      <VideoTiles
        videoElements={new Map([['sid:1004', videoEl()]])}
        localIdentity="teacher"
        variant="classroom"
        participants={[participant('sid:1004', '金子 大地', { videoEnabled: false })]}
      />,
    );
    expect(screen.getByText('カメラ オフ')).toBeInTheDocument();
  });

  it('カメラを点けた直後、参加者一覧が古くても自分の映像は隠さない', () => {
    const elements = remoteOnly();
    elements.set('sid:1000', videoEl());
    render(
      <VideoTiles
        videoElements={elements}
        localIdentity="sid:1000"
        isCameraEnabled={true}
        participants={[
          // LiveKit のイベントが届く前の、まだ「切」のままの自分
          participant('sid:1000', 'たろう', { videoEnabled: false }),
          participant('sid:2000', '三村九段'),
        ]}
      />,
    );
    expect(screen.queryByText('カメラ オフ')).not.toBeInTheDocument();
  });

  it('マイクが切れている人には札を出す', () => {
    render(
      <VideoTiles
        videoElements={remoteOnly()}
        localIdentity="sid:1000"
        participants={[participant('sid:2000', '三村九段', { audioEnabled: false })]}
      />,
    );
    expect(screen.getByTitle('マイクが切れています')).toBeInTheDocument();
  });

  it('全員が映っていて声も出せるなら札は出ない', () => {
    const elements = remoteOnly();
    elements.set('sid:1000', videoEl());
    render(
      <VideoTiles
        videoElements={elements}
        localIdentity="sid:1000"
        isCameraEnabled={true}
        participants={[
          participant('sid:1000', 'たろう'),
          participant('sid:2000', '三村九段'),
        ]}
      />,
    );
    expect(screen.queryByText('カメラ オフ')).not.toBeInTheDocument();
    expect(screen.queryByTitle('マイクが切れています')).not.toBeInTheDocument();
  });

  it('参加者の状態が分からないときは札を出さない', () => {
    render(<VideoTiles videoElements={remoteOnly()} localIdentity="sid:1000" />);
    expect(screen.queryByText('カメラ オフ')).not.toBeInTheDocument();
    expect(screen.queryByTitle('マイクが切れています')).not.toBeInTheDocument();
  });

  it('映像が1つも無ければ何も描かない', () => {
    const { container } = render(
      <VideoTiles videoElements={new Map()} localIdentity="sid:1000" isCameraEnabled={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('自分の映像の向き', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('既定では鏡像にしない（生徒に届いているのと同じ向きで見る）', () => {
    const { container } = render(
      <VideoTiles
        videoElements={new Map([['teacher', videoEl()]])}
        localIdentity="teacher"
        participants={[participant('teacher', '三村九段')]}
        variant="classroom"
      />
    );
    expect(container.innerHTML).not.toContain('scale-x-[-1]');
  });

  it('設定を入れると自分の映像だけ鏡像になる', () => {
    saveMirrorLocalVideo(true);
    const { container } = render(
      <VideoTiles
        videoElements={new Map([['teacher', videoEl()], ['sid:1004', videoEl()]])}
        localIdentity="teacher"
        participants={[participant('teacher', '三村九段'), participant('sid:1004', '金子 大地')]}
        variant="classroom"
      />
    );
    // 自分の1枚だけに掛かる（生徒の映像には掛からない）
    expect(container.innerHTML.split('scale-x-[-1]').length - 1).toBe(1);
  });

  it('小さい並びでも設定に従う', () => {
    saveMirrorLocalVideo(true);
    const { container } = render(
      <VideoTiles
        videoElements={new Map([['teacher', videoEl()]])}
        localIdentity="teacher"
        participants={[participant('teacher', '三村九段')]}
      />
    );
    expect(container.innerHTML).toContain('scale-x-[-1]');
  });
});
