import { Flame, Snowflake } from 'lucide-react';
import type { PeerMood } from '../../utils/tsumegoPeers';
import './TsumegoMoodIcon.css';

interface TsumegoMoodIconProps {
  mood: PeerMood;
  label?: string;
}

/** 名前や正解数を動かさず、仲間の状態を小さな動きで伝える。 */
export default function TsumegoMoodIcon({ mood, label }: TsumegoMoodIconProps) {
  if (!mood) return null;
  const Icon = mood === 'fire' ? Flame : Snowflake;
  return (
    <span
      role="img"
      aria-label={label ?? (mood === 'fire' ? '炎' : '氷')}
      className={`tsumego-mood-icon tsumego-mood-icon--${mood} ${mood === 'fire' ? 'text-alert-text' : 'text-sky-500'}`}
    >
      <Icon size={16} className="tsumego-mood-glyph" aria-hidden="true" />
    </span>
  );
}
