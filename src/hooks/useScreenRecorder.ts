import { useState, useRef, useCallback } from 'react';

export type RecordingState = 'idle' | 'recording' | 'stopped';

export function useScreenRecorder() {
  const [state, setState] = useState<RecordingState>('idle');
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = useCallback(async (element?: HTMLElement) => {
    try {
      let stream: MediaStream;

      if (element) {
        // Try to capture a specific element (requires getDisplayMedia)
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
      }

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
          ? 'video/webm;codecs=vp9'
          : 'video/webm',
      });

      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setDownloadUrl(url);
        setState('stopped');
        if (timerRef.current) clearInterval(timerRef.current);

        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      recorder.start(1000); // Collect data every second
      startTimeRef.current = Date.now();
      setState('recording');
      setDuration(0);
      setDownloadUrl(null);

      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (err) {
      console.error('Recording failed:', err);
    }
  }, []);

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
  }, [downloadUrl]);

  return {
    state,
    duration,
    downloadUrl,
    startRecording,
    stopRecording,
    downloadRecording,
    reset,
  };
}
