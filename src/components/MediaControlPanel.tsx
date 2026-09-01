import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import type { ParticipantInfo } from '../utils/classroomRtc';
import type { AudioPermissions } from '../types/game';
import { resolvePlayerName } from '../utils/identityUtils';

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
    return <div className="text-muted text-sm text-center py-2">生徒が接続されていません</div>;
  }

  return (
    <div className="space-y-2">
      {students.map(p => {
        const perms = audioPermissions[p.identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
        return (
          <div key={p.identity} className="flex items-center justify-between bg-ink/5 rounded-lg px-3 py-2 text-sm">
            <span className="truncate flex-1">{p.name || resolvePlayerName(p.identity, [])}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onToggleHear(p.identity)}
                className={`p-1.5 rounded transition-all ${
                  perms.canHear ? 'text-ink hover:bg-ink/8' : 'text-alert-text hover:bg-alert/15'
                }`}
                title={perms.canHear ? 'こちらのマイク音声が届いています' : 'こちらのマイク音声が届いていません'}
              >
                {perms.canHear ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              </button>
              <button
                onClick={() => onToggleMic(p.identity)}
                className={`p-1.5 rounded transition-all ${
                  perms.micAllowed ? 'text-ink hover:bg-ink/8' : 'text-alert-text hover:bg-alert/15'
                }`}
                title={perms.micAllowed ? 'この生徒の声が聞こえます' : 'この生徒の声が聞こえません'}
              >
                {perms.micAllowed ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
