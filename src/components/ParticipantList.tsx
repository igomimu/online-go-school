import { Mic, MicOff } from 'lucide-react';
import type { ParticipantInfo } from '../utils/classroomLiveKit';

interface ParticipantListProps {
  participants: ParticipantInfo[];
  localIdentity: string;
  activeSpeakers: string[];
}

export default function ParticipantList({
  participants,
  localIdentity,
  activeSpeakers,
}: ParticipantListProps) {
  if (participants.length === 0) return null;

  return (
    <div className="space-y-2">
      {participants.map((p) => {
        const isLocal = p.identity === localIdentity;
        const isSpeaking = activeSpeakers.includes(p.identity);
        return (
          <div
            key={p.identity}
            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
              isSpeaking ? 'bg-ink/8 border border-ink/25' : 'bg-ink/5 border border-transparent'
            }`}
          >
            <span className={isLocal ? 'font-semibold' : ''}>
              {p.name || '参加者'}
              {isLocal && <span className="text-muted ml-1">(you)</span>}
            </span>
            <span className={p.audioEnabled ? 'text-ink' : 'text-muted/75'}>
              {p.audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
            </span>
          </div>
        );
      })}
    </div>
  );
}
