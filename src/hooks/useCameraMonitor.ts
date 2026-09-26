import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClassroomRtc } from '../utils/classroomRtc';

export interface CameraMonitorState {
  warning: string;
  recovering: boolean;
  dismissWarning: () => void;
  restartCamera: () => Promise<void>;
}

const CHECK_INTERVAL_MS = 1_000;
const STALLED_CHECKS_BEFORE_RECOVERY = 4;

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'カメラを使っているほかのアプリを閉じて、もう一度試してください。';
}

/**
 * 講師のカメラが「ON表示なのに映像が出ていない」状態を監視する。
 *
 * RealtimeKit はカメラ機器が途中で止まっても videoEnabled が true のまま残ることがある。
 * その場合は表示側の video 要素を付け直しても直らないため、保存済みの機器を選び直して
 * カメラだけを一度再起動する。教室接続・囲碁盤・音声は切らない。
 */
export function useCameraMonitor(
  classroom: ClassroomRtc | null,
  enabled: boolean,
): CameraMonitorState {
  const [warning, setWarning] = useState('');
  const [recovering, setRecovering] = useState(false);
  const recoveryAttemptedRef = useRef(false);
  const recoveryInFlightRef = useRef(false);
  const disposedRef = useRef(false);

  const dismissWarning = useCallback(() => setWarning(''), []);

  const restartCamera = useCallback(async () => {
    if (!classroom?.isConnected || recoveryInFlightRef.current) return;
    recoveryInFlightRef.current = true;
    recoveryAttemptedRef.current = true;
    setRecovering(true);
    try {
      await classroom.disableCamera();
      await classroom.applySavedDevices();
      await classroom.enableCamera();
      if (!disposedRef.current) {
        setWarning('カメラ映像が止まったため、自動で再起動しました。映像を確認してください。');
      }
    } catch (error) {
      if (!disposedRef.current) {
        setWarning(`カメラ映像を再開できませんでした。${messageOf(error)}`);
      }
    } finally {
      recoveryInFlightRef.current = false;
      if (!disposedRef.current) setRecovering(false);
    }
  }, [classroom]);

  useEffect(() => {
    disposedRef.current = false;
    let lastVideoTime = -1;
    let stalledChecks = 0;
    let healthyChecks = 0;

    const reset = () => {
      lastVideoTime = -1;
      stalledChecks = 0;
      healthyChecks = 0;
      recoveryAttemptedRef.current = false;
    };

    const inspect = () => {
      if (!enabled || !classroom?.isConnected) {
        reset();
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const video = classroom.getLocalVideoElement();
      // 対局盤などへ移動して映像タイルがDOMから外れたときは、再生時刻が止まっても
      // カメラ機器の故障ではない。表示中のタイルだけを監視する。
      if (video && !video.isConnected) return;
      const stream = video?.srcObject as MediaStream | null | undefined;
      const track = stream?.getVideoTracks?.()[0];
      const videoTime = video?.currentTime ?? -1;
      const frameAdvanced = videoTime >= 0 && (lastVideoTime < 0 || videoTime > lastVideoTime + 0.01);
      const trackHealthy = !!track && track.readyState === 'live' && !track.muted;

      if (trackHealthy && frameAdvanced) {
        stalledChecks = 0;
        healthyChecks += 1;
        lastVideoTime = videoTime;
        // 自動復旧後に実際のフレームが続けば、次回の停止時はもう一度だけ復旧を試せる。
        if (healthyChecks >= 2) recoveryAttemptedRef.current = false;
        return;
      }

      healthyChecks = 0;
      if (videoTime >= 0) lastVideoTime = videoTime;
      stalledChecks += 1;
      if (
        stalledChecks >= STALLED_CHECKS_BEFORE_RECOVERY
        && !recoveryAttemptedRef.current
        && !recoveryInFlightRef.current
      ) {
        void restartCamera();
      }
    };

    const firstInspect = window.setTimeout(inspect, 0);
    const timer = window.setInterval(inspect, CHECK_INTERVAL_MS);
    return () => {
      disposedRef.current = true;
      window.clearTimeout(firstInspect);
      window.clearInterval(timer);
    };
  }, [classroom, enabled, restartCamera]);

  return { warning, recovering, dismissWarning, restartCamera };
}
