import { useScreenRecorder } from '../hooks/useScreenRecorder';
import { Video, Square, Download, RotateCcw } from 'lucide-react';

export default function RecordingControls() {
  const recorder = useScreenRecorder();

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      {recorder.state === 'idle' && (
        <button
          onClick={() => recorder.startRecording()}
          className="flex items-center gap-1 px-2 py-1 text-xs bg-alert/10 text-alert-text border border-alert/25 rounded hover:bg-alert/15"
          title="録画開始"
        >
          <Video className="w-3 h-3" /> 録画
        </button>
      )}

      {recorder.state === 'recording' && (
        <>
          <span className="text-xs text-alert-text animate-pulse font-mono">
            ● {formatDuration(recorder.duration)}
          </span>
          <button
            onClick={recorder.stopRecording}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-raised/60 text-ink border border-line rounded hover:bg-raised"
          >
            <Square className="w-3 h-3" /> 停止
          </button>
        </>
      )}

      {recorder.state === 'stopped' && (
        <>
          <button
            onClick={recorder.downloadRecording}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-accent/12 text-accent-text border border-accent/35 rounded hover:bg-accent/18"
          >
            <Download className="w-3 h-3" /> 保存
          </button>
          <button
            onClick={recorder.reset}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-ink/5 text-muted rounded hover:bg-ink/10"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  );
}
