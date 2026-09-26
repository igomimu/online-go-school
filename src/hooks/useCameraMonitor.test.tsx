import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassroomRtc } from '../utils/classroomRtc';
import { useCameraMonitor } from './useCameraMonitor';

describe('useCameraMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('カメラONなのに映像要素が無い状態が続けば、カメラだけを再起動する', async () => {
    const classroom = {
      isConnected: true,
      getLocalVideoElement: () => undefined,
      disableCamera: vi.fn().mockResolvedValue(undefined),
      applySavedDevices: vi.fn().mockResolvedValue(undefined),
      enableCamera: vi.fn().mockResolvedValue(undefined),
    } as unknown as ClassroomRtc;

    const { result } = renderHook(() => useCameraMonitor(classroom, true));
    await act(async () => vi.advanceTimersByTimeAsync(3_100));

    expect(classroom.disableCamera).toHaveBeenCalledTimes(1);
    expect(classroom.applySavedDevices).toHaveBeenCalledTimes(1);
    expect(classroom.enableCamera).toHaveBeenCalledTimes(1);
    expect(result.current.warning).toContain('自動で再起動しました');
  });

  it('カメラがOFFなら再起動しない', async () => {
    const classroom = {
      isConnected: true,
      getLocalVideoElement: () => undefined,
      disableCamera: vi.fn(),
      applySavedDevices: vi.fn(),
      enableCamera: vi.fn(),
    } as unknown as ClassroomRtc;

    renderHook(() => useCameraMonitor(classroom, false));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(classroom.disableCamera).not.toHaveBeenCalled();
  });

  it('映像フレームが進んでいれば再起動しない', async () => {
    const track = { readyState: 'live', muted: false } as MediaStreamTrack;
    const video = {
      currentTime: 0,
      isConnected: true,
      srcObject: { getVideoTracks: () => [track] },
    } as unknown as HTMLVideoElement;
    const classroom = {
      isConnected: true,
      getLocalVideoElement: () => video,
      disableCamera: vi.fn(),
      applySavedDevices: vi.fn(),
      enableCamera: vi.fn(),
    } as unknown as ClassroomRtc;

    renderHook(() => useCameraMonitor(classroom, true));
    for (let second = 1; second <= 8; second += 1) {
      video.currentTime = second;
      await act(async () => vi.advanceTimersByTimeAsync(1_000));
    }
    expect(classroom.disableCamera).not.toHaveBeenCalled();
  });

  it('再起動に失敗した理由を表示し、手動で再試行できる', async () => {
    const classroom = {
      isConnected: true,
      getLocalVideoElement: () => undefined,
      disableCamera: vi.fn().mockResolvedValue(undefined),
      applySavedDevices: vi.fn().mockResolvedValue(undefined),
      enableCamera: vi.fn()
        .mockRejectedValueOnce(new Error('別のアプリがカメラを使用しています'))
        .mockResolvedValueOnce(undefined),
    } as unknown as ClassroomRtc;

    const { result } = renderHook(() => useCameraMonitor(classroom, true));
    await act(async () => vi.advanceTimersByTimeAsync(3_100));
    expect(result.current.warning).toContain('別のアプリがカメラを使用しています');

    await act(async () => result.current.restartCamera());
    expect(classroom.enableCamera).toHaveBeenCalledTimes(2);
  });
});
