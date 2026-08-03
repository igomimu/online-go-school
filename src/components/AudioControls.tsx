import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface AudioControlsProps {
  isMicEnabled: boolean;
  onToggleMic: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

export default function AudioControls({
  isMicEnabled,
  onToggleMic,
  isMuted,
  onToggleMute,
}: AudioControlsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onToggleMic}
        className={`p-2 rounded-lg transition-all ${
          isMicEnabled
            ? 'bg-kinari/10 text-kinari hover:bg-kinari/15'
            : 'bg-white/5 text-zinc-500 hover:bg-white/10'
        }`}
        title={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
      </button>
      <button
        onClick={onToggleMute}
        className={`p-2 rounded-lg transition-all ${
          isMuted
            ? 'bg-shu/20 text-shu-light hover:bg-shu/30'
            : 'bg-white/5 text-zinc-400 hover:bg-white/10'
        }`}
        title={isMuted ? 'Unmute audio' : 'Mute audio'}
      >
        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>
    </div>
  );
}
