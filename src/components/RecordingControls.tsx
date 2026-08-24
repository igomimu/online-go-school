import { useScreenRecorder } from '../hooks/useScreenRecorder';
import { Video, Square, Download, RotateCcw } from 'lucide-react';
import type { ClassroomLiveKit } from '../utils/classroomLiveKit';

interface RecordingControlsProps {
  /** 録画に混ぜる声（自分のマイク＋生徒）の取り出しに使う */
  classroom?: ClassroomLiveKit | null;
}

export default function RecordingControls({ classroom }: RecordingControlsProps) {
  const recorder = useScreenRecorder(classroom);

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2">
      {recorder.error && (
        <span className="text-xs text-alert-text">{recorder.error}</span>
      )}

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
          {/* 声が1つも入っていなければ無音の動画ができる。90分録ってから気づくのを防ぐ */}
          <span
            className={`text-xs ${recorder.voiceCount === 0 ? 'text-alert-text' : 'text-muted'}`}
            title={recorder.voiceCount === 0
              ? '声が録れていません。マイクが切れていないか確かめてください'
              : '録音している声の数（自分＋生徒）'}
          >
            {recorder.voiceCount === 0 ? '声なし' : `声 ${recorder.voiceCount}`}
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
