import { useState, useRef, useCallback, useEffect } from 'react';
import type { ClassroomLiveKit } from '../utils/classroomLiveKit';

export type RecordingState = 'idle' | 'recording' | 'stopped';

// 音声つきを優先する。授業の録画は解説の声が入っていなければ用をなさない
const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'video/webm';
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm';
}

/**
 * 講師の画面を録画する。
 *
 * 音声は getDisplayMedia からは取らない。画面共有の音声は「スピーカーから鳴っている音」
 * であって、自分の声はスピーカーから出ないため講師の解説がまるごと落ちる。
 * LiveKit が持っている音声トラック（自分のマイク＋生徒の声）を AudioContext で
 * ひとつに混ぜて、映像と一緒に録る。
 */
export function useScreenRecorder(classroom?: ClassroomLiveKit | null) {
  const [state, setState] = useState<RecordingState>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  /** 録音できている声の数（0なら無音の動画になる＝講師に気づいてもらう） */
  const [voiceCount, setVoiceCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const destRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const sourcesRef = useRef(new Map<MediaStreamTrack, MediaStreamAudioSourceNode>());
  const classroomRef = useRef<ClassroomLiveKit | null | undefined>(classroom);
  useEffect(() => {
    classroomRef.current = classroom;
  }, [classroom]);

  /** いま鳴っている声を混ぜ直す。録画の途中で入ってきた生徒の声も拾う */
  const syncAudioTracks = useCallback(() => {
    const ctx = audioCtxRef.current;
    const dest = destRef.current;
    const room = classroomRef.current;
    if (!ctx || !dest || !room) return;

    const tracks = room.collectAudioTracks();

    for (const track of tracks) {
      if (sourcesRef.current.has(track)) continue;
      try {
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        source.connect(dest);
        sourcesRef.current.set(track, source);
      } catch {
        // 取れない声が1つあっても録画そのものは続ける
      }
    }

    for (const [track, source] of sourcesRef.current) {
      if (tracks.includes(track)) continue;
      source.disconnect();
      sourcesRef.current.delete(track);
    }

    setVoiceCount(sourcesRef.current.size);
  }, []);

  const teardownAudio = useCallback(() => {
    const room = classroomRef.current;
    if (room) room.onAudioTracksChanged = undefined;
    sourcesRef.current.forEach((s) => s.disconnect());
    sourcesRef.current.clear();
    destRef.current = null;
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close();
    setVoiceCount(0);
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    let display: MediaStream | null = null;

    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const stream = new MediaStream(display.getVideoTracks());
      const room = classroomRef.current;

      if (room) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        destRef.current = ctx.createMediaStreamDestination();
        syncAudioTracks();
        destRef.current.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
        // 録画中に入ってきた生徒の声、途中で点けたマイクを拾い直す
        room.onAudioTracksChanged = syncAudioTracks;
      }

      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });

      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setDownloadUrl(URL.createObjectURL(blob));
        setState('stopped');
        if (timerRef.current) clearInterval(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        display?.getTracks().forEach((track) => track.stop());
        teardownAudio();
      };

      // ブラウザの「共有を停止」を押されたら録画も止める（押しても録り続けると気づけない）
      display.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (mediaRecorderRef.current?.state !== 'inactive') {
            mediaRecorderRef.current?.stop();
          }
        };
      });

      recorder.start(1000); // 1秒ごとに切り出す
      startTimeRef.current = Date.now();
      setState('recording');
      setDuration(0);
      setDownloadUrl(null);

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      display?.getTracks().forEach((track) => track.stop());
      teardownAudio();
      setState('idle');
      const name = err instanceof DOMException ? err.name : '';
      setError(
        name === 'NotAllowedError'
          ? '画面の共有が許可されませんでした'
          : '録画を始められませんでした',
      );
      console.error('Recording failed:', err);
    }
  }, [syncAudioTracks, teardownAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const downloadRecording = useCallback(() => {
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
    a.click();
  }, [downloadUrl]);

  const reset = useCallback(() => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setDownloadUrl(null);
    setState('idle');
    setDuration(0);
    setError(null);
  }, [downloadUrl]);

  // 教室から出るときに録音の後始末をする（AudioContext を開いたままにしない）
  useEffect(() => teardownAudio, [teardownAudio]);

  return {
    state,
    duration,
    downloadUrl,
    voiceCount,
    error,
    startRecording,
    stopRecording,
    downloadRecording,
    reset,
  };
}
