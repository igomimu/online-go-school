import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassroomRtc } from '../utils/classroomRtc';
import { microphoneLevelFromSamples, useMicrophoneMonitor } from './useMicrophoneMonitor';

function mockTrack(label: string, deviceId: string): MediaStreamTrack {
  return {
    label,
    readyState: 'live',
    getSettings: () => ({ deviceId }),
  } as unknown as MediaStreamTrack;
}

describe('microphoneLevelFromSamples', () => {
  it('無音を0、十分な入力を1として返す', () => {
    expect(microphoneLevelFromSamples(new Uint8Array([128, 128, 128]))).toBe(0);
    expect(microphoneLevelFromSamples(new Uint8Array([96, 160, 96, 160]))).toBe(1);
  });
});

describe('useMicrophoneMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('現在のマイク名を表示し、途中で別機器へ変わったら警告する', () => {
    let track = mockTrack('ヘッドセット (WF-1000XM5)', 'sony');
    const classroom = {
      isConnected: true,
      getLocalAudioTrack: () => track,
    } as unknown as ClassroomRtc;
    localStorage.setItem('go-school-device-mic', 'sony');

    const { result } = renderHook(() => useMicrophoneMonitor(classroom, true));
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.deviceLabel).toBe('ヘッドセット (WF-1000XM5)');
    expect(result.current.warning).toBe('');

    track = mockTrack('マイク (Logi C270 HD WebCam)', 'webcam');
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.deviceLabel).toBe('マイク (Logi C270 HD WebCam)');
    expect(result.current.warning).toContain('切り替わりました');
    expect(result.current.warning).toContain('WF-1000XM5');
    expect(result.current.warning).toContain('Logi C270');
  });

  it('保存したマイクと実際の入力が違えばフォールバックとして警告する', () => {
    const classroom = {
      isConnected: true,
      getLocalAudioTrack: () => mockTrack('マイク (Logi C270 HD WebCam)', 'webcam'),
    } as unknown as ClassroomRtc;
    localStorage.setItem('go-school-device-mic', 'sony');

    const { result } = renderHook(() => useMicrophoneMonitor(classroom, true));
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.warning).toContain('選択していたマイクを使用できず');
    expect(result.current.warning).toContain('Logi C270');
  });

  it('マイクONなのにトラックが無い状態が続けば警告する', () => {
    const classroom = {
      isConnected: true,
      getLocalAudioTrack: () => undefined,
    } as unknown as ClassroomRtc;

    const { result } = renderHook(() => useMicrophoneMonitor(classroom, true));
    act(() => vi.advanceTimersByTime(1_501));
    expect(result.current.warning).toContain('音声入力を取得できていません');
  });
});
