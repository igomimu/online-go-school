import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import type { ParticipantInfo } from '../utils/classroomLiveKit';
import type { AudioPermissions } from '../types/game';

interface MediaControlPanelProps {
  participants: ParticipantInfo[];
  localIdentity: string;
  audioPermissions: AudioPermissions;
  onToggleHear: (identity: string) => void;
  onToggleMic: (identity: string) => void;
}

export default function MediaControlPanel({
  participants,
  localIdentity,
  audioPermissions,
  onToggleHear,
  onToggleMic,
}: MediaControlPanelProps) {
  // 先生自身を除外
  const students = participants.filter(p => p.identity !== localIdentity);

  if (students.length === 0) {
    return <div className="text-zinc-500 text-sm text-center py-2">生徒が接続されていません</div>;
  }

  return (
    <div className="space-y-2">
      {students.map(p => {
        const perms = audioPermissions[p.identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
        return (
          <div key={p.identity} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-sm">
            <span className="truncate flex-1">{p.identity}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onToggleHear(p.identity)}
                className={`p-1.5 rounded transition-all ${
                  perms.canHear ? 'text-green-400 hover:bg-green-500/20' : 'text-red-400 hover:bg-red-500/20'
                }`}
                title={perms.canHear ? '音声配信中' : '音声停止中'}
              >
                {perms.canHear ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                onClick={() => onToggleMic(p.identity)}
                className={`p-1.5 rounded transition-all ${
                  perms.micAllowed ? 'text-green-400 hover:bg-green-500/20' : 'text-red-400 hover:bg-red-500/20'
                }`}
                title={perms.micAllowed ? 'マイク許可中' : 'マイク禁止中'}
              >
                {perms.micAllowed ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
