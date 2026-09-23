import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClassroomRtc } from '../utils/classroomRtc';
import { getSavedDeviceId } from '../utils/mediaDevices';

export interface MicrophoneMonitorState {
  deviceLabel: string;
  level: number;
  warning: string;
  dismissWarning: () => void;
}

/** Web Audio の波形（中心128）を、メーター用の0〜1へ変換する。 */
export function microphoneLevelFromSamples(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }
  // 通常の会話音声はRMSが小さいため4倍して、ささやき〜通常声でも動きが見えるようにする。
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/**
 * 現在配信しているマイクの名前と入力レベルを監視する。
 * RTC SDK任せで別マイクへフォールバックした場合も、講師がその場で気づけるようにする。
 */
export function useMicrophoneMonitor(
  classroom: ClassroomRtc | null,
  enabled: boolean,
): MicrophoneMonitorState {
  const [deviceLabel, setDeviceLabel] = useState('マイクOFF');
  const [level, setLevel] = useState(0);
  const [warning, setWarning] = useState('');
  const previousLabelRef = useRef('');
  const lastWarningKeyRef = useRef('');

  const dismissWarning = useCallback(() => setWarning(''), []);

  useEffect(() => {
    let currentTrack: MediaStreamTrack | undefined;
    let audioContext: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let samples: Uint8Array<ArrayBuffer> | null = null;
    let missingTrackChecks = 0;
    let disposed = false;

    const warnOnce = (key: string, message: string) => {
      if (lastWarningKeyRef.current === key) return;
      lastWarningKeyRef.current = key;
      setWarning(message);
    };

    const releaseAnalyser = () => {
      try { source?.disconnect(); } catch { /* 既に切断済みでもよい */ }
      source = null;
      analyser = null;
      samples = null;
      if (audioContext) void audioContext.close().catch(() => {});
      audioContext = null;
    };

    const attachAnalyser = (track: MediaStreamTrack) => {
      releaseAnalyser();
      if (typeof AudioContext === 'undefined') return;
      try {
        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(new MediaStream([track]));
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        samples = new Uint8Array(analyser.fftSize);
        source.connect(analyser);
        void audioContext.resume().catch(() => {});
      } catch {
        releaseAnalyser();
      }
    };

    const inspectTrack = () => {
      if (disposed) return;
      if (!enabled || !classroom?.isConnected) {
        currentTrack = undefined;
        previousLabelRef.current = '';
        missingTrackChecks = 0;
        releaseAnalyser();
        setDeviceLabel('マイクOFF');
        setLevel(0);
        return;
      }

      const track = classroom.getLocalAudioTrack();
      if (!track || track.readyState === 'ended') {
        missingTrackChecks += 1;
        setDeviceLabel('マイクを確認中…');
        setLevel(0);
        if (missingTrackChecks >= 4) {
          warnOnce('track-missing', 'マイクはONですが、音声入力を取得できていません。');
        }
        return;
      }

      missingTrackChecks = 0;
      const nextLabel = track.label || '名前を取得できないマイク';
      const previousLabel = previousLabelRef.current;
      const savedDeviceId = getSavedDeviceId('audioinput');
      const actualDeviceId = track.getSettings?.().deviceId;
      // 「default」は実体のdeviceIdと一致しないブラウザがあるので比較対象外にする。
      const fellBack = !!savedDeviceId
        && savedDeviceId !== 'default'
        && !!actualDeviceId
        && savedDeviceId !== actualDeviceId;
      if (previousLabel && previousLabel !== nextLabel) {
        warnOnce(
          `changed:${previousLabel}:${nextLabel}`,
          `使用中のマイクが「${previousLabel}」から「${nextLabel}」へ切り替わりました。${fellBack ? '選択していたマイクと異なります。' : ''}`,
        );
      } else if (fellBack) {
        warnOnce(
          `fallback:${savedDeviceId}:${actualDeviceId}`,
          `選択していたマイクを使用できず、「${nextLabel}」へ切り替わっています。`,
        );
      }
      previousLabelRef.current = nextLabel;
      setDeviceLabel(nextLabel);

      if (track !== currentTrack) {
        currentTrack = track;
        attachAnalyser(track);
      }
    };

    const readLevel = () => {
      if (!enabled || !analyser || !samples) {
        setLevel(0);
        return;
      }
      analyser.getByteTimeDomainData(samples);
      const next = microphoneLevelFromSamples(samples);
      setLevel(prev => prev * 0.55 + next * 0.45);
    };

    // effect本体で同期setStateをせず、タイマーから監視を開始する。
    const firstInspect = window.setTimeout(inspectTrack, 0);
    const inspectTimer = window.setInterval(inspectTrack, 500);
    const levelTimer = window.setInterval(readLevel, 120);

    return () => {
      disposed = true;
      window.clearTimeout(firstInspect);
      window.clearInterval(inspectTimer);
      window.clearInterval(levelTimer);
      releaseAnalyser();
    };
  }, [classroom, enabled]);

  return { deviceLabel, level, warning, dismissWarning };
}
