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
          className="flex items-center gap-1 px-2 py-1 text-xs bg-shu/10 text-shu-light border border-shu/20 rounded hover:bg-shu/20"
          title="録画開始"
        >
          <Video className="w-3 h-3" /> 録画
        </button>
      )}

      {recorder.state === 'recording' && (
        <>
          <span className="text-xs text-shu-light animate-pulse font-mono">
            ● {formatDuration(recorder.duration)}
          </span>
          <button
            onClick={recorder.stopRecording}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-zinc-500/10 text-zinc-300 border border-zinc-500/20 rounded hover:bg-zinc-500/20"
          >
            <Square className="w-3 h-3" /> 停止
          </button>
        </>
      )}

      {recorder.state === 'stopped' && (
        <>
          <button
            onClick={recorder.downloadRecording}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-kaya/10 text-kaya border border-kaya/30 rounded hover:bg-kaya/20"
          >
            <Download className="w-3 h-3" /> 保存
          </button>
          <button
            onClick={recorder.reset}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-white/5 text-zinc-500 rounded hover:bg-white/10"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </>
      )}
    </div>
  );
}
