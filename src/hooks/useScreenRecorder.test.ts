import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useScreenRecorder } from './useScreenRecorder';
import type { ClassroomLiveKit } from '../utils/classroomLiveKit';

/** jsdom には MediaStream / MediaRecorder / AudioContext が無いので最小限を用意する */
class FakeTrack {
  kind: string;
  stopped = false;
  onended: (() => void) | null = null;
  constructor(kind: string) { this.kind = kind; }
  stop() { this.stopped = true; }
}

class FakeMediaStream {
  tracks: FakeTrack[];
  constructor(tracks: FakeTrack[] = []) { this.tracks = [...tracks]; }
  getTracks() { return this.tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
  addTrack(t: FakeTrack) { this.tracks.push(t); }
}

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  static last: FakeMediaRecorder | null = null;
  state = 'inactive';
  stream: FakeMediaStream;
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(stream: FakeMediaStream, opts?: { mimeType?: string }) {
    this.stream = stream;
    this.mimeType = opts?.mimeType ?? '';
    FakeMediaRecorder.last = this;
  }
  start() { this.state = 'recording'; }
  stop() { this.state = 'inactive'; this.onstop?.(); }
}

class FakeAudioContext {
  static last: FakeAudioContext | null = null;
  state = 'running';
  sources: { connect: () => void; disconnect: () => void }[] = [];
  constructor() { FakeAudioContext.last = this; }
  createMediaStreamDestination() {
    return { stream: new FakeMediaStream([new FakeTrack('audio')]) };
  }
  createMediaStreamSource() {
    const node = { connect: vi.fn(), disconnect: vi.fn() };
    this.sources.push(node);
    return node;
  }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

let displayTrack: FakeTrack;
let voices: FakeTrack[];
let classroom: ClassroomLiveKit;
let getDisplayMedia: ReturnType<typeof vi.fn>;

function makeClassroom() {
  return {
    collectAudioTracks: () => voices,
    onAudioTracksChanged: undefined,
  } as unknown as ClassroomLiveKit;
}

beforeEach(() => {
  displayTrack = new FakeTrack('video');
  voices = [new FakeTrack('audio')];
  classroom = makeClassroom();
  getDisplayMedia = vi.fn(async () => new FakeMediaStream([displayTrack]));

  vi.stubGlobal('MediaStream', FakeMediaStream);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia } });
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  FakeMediaRecorder.last = null;
  FakeAudioContext.last = null;
});

describe('useScreenRecorder', () => {
  it('画面の映像と、混ぜた声の両方を録る', async () => {
    const { result } = renderHook(() => useScreenRecorder(classroom));

    await act(async () => { await result.current.startRecording(); });

    const stream = FakeMediaRecorder.last!.stream;
    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(stream.getAudioTracks()).toHaveLength(1); // ミックス済みの1本
    expect(FakeMediaRecorder.last!.mimeType).toContain('opus');
    expect(result.current.state).toBe('recording');
    expect(result.current.voiceCount).toBe(1);
  });

  it('録画中に入ってきた生徒の声も混ぜる', async () => {
    const { result } = renderHook(() => useScreenRecorder(classroom));
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.voiceCount).toBe(1);

    // 生徒が2人入ってきた
    voices = [...voices, new FakeTrack('audio'), new FakeTrack('audio')];
    act(() => { classroom.onAudioTracksChanged?.(); });

    await waitFor(() => expect(result.current.voiceCount).toBe(3));
  });

  it('出ていった人の声は外す', async () => {
    voices = [new FakeTrack('audio'), new FakeTrack('audio')];
    const { result } = renderHook(() => useScreenRecorder(classroom));
    await act(async () => { await result.current.startRecording(); });
    expect(result.current.voiceCount).toBe(2);

    voices = [voices[0]];
    act(() => { classroom.onAudioTracksChanged?.(); });

    await waitFor(() => expect(result.current.voiceCount).toBe(1));
  });

  it('声が1つも無ければ voiceCount は 0（無音の動画になると気づける）', async () => {
    voices = [];
    const { result } = renderHook(() => useScreenRecorder(classroom));
    await act(async () => { await result.current.startRecording(); });

    expect(result.current.state).toBe('recording');
    expect(result.current.voiceCount).toBe(0);
  });

  it('停止すると画面共有も AudioContext も後始末する', async () => {
    const { result } = renderHook(() => useScreenRecorder(classroom));
    await act(async () => { await result.current.startRecording(); });
    const ctx = FakeAudioContext.last!;

    act(() => { result.current.stopRecording(); });

    expect(result.current.state).toBe('stopped');
    expect(displayTrack.stopped).toBe(true);
    expect(ctx.state).toBe('closed');
    expect(classroom.onAudioTracksChanged).toBeUndefined();
  });

  it('ブラウザの「共有を停止」で録画も止まる', async () => {
    const { result } = renderHook(() => useScreenRecorder(classroom));
    await act(async () => { await result.current.startRecording(); });

    act(() => { displayTrack.onended?.(); });

    await waitFor(() => expect(result.current.state).toBe('stopped'));
  });

  it('画面の共有を断られたら理由を出して idle に戻る', async () => {
    getDisplayMedia.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useScreenRecorder(classroom));

    await act(async () => { await result.current.startRecording(); });

    expect(result.current.state).toBe('idle');
    expect(result.current.error).toBe('画面の共有が許可されませんでした');
  });

  it('教室に繋がっていなくても画面だけは録れる', async () => {
    const { result } = renderHook(() => useScreenRecorder(null));
    await act(async () => { await result.current.startRecording(); });

    expect(result.current.state).toBe('recording');
    expect(FakeMediaRecorder.last!.stream.getAudioTracks()).toHaveLength(0);
  });
});
