import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../../types/chat';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student } from '../../types/classroom';
import { getDisplayName } from '../../utils/identityUtils';

interface ChatPanelProps {
  messages: ChatMessage[];
  participants: ParticipantInfo[];
  students: Student[];
  localIdentity: string;
  onSend: (text: string, target: 'all' | string) => void;
  // 生徒側など、宛先選択が不要な場合は false（常に 'all' で送信）
  showTargetSelector?: boolean;
}

export default function ChatPanel({
  messages,
  participants,
  students,
  localIdentity,
  onSend,
  showTargetSelector = true,
}: ChatPanelProps) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<'all' | string>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text, target);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const remoteParticipants = participants.filter(p => p.identity !== localIdentity);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* 送信先 + トークルーム（先生のみ） */}
      {showTargetSelector && (
        <div className="border-b border-line p-2">
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="w-full rounded-md border border-line bg-ground px-2 py-1 text-[13px] text-ink"
          >
            <option value="all">生徒全員</option>
            {remoteParticipants.map(p => (
              <option key={p.identity} value={p.identity}>
                {getDisplayName(p.identity, students)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* メッセージ表示 */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-ground p-2 text-[13px] leading-relaxed"
      >
        {messages.map(msg => {
          const isMe = msg.sender === localIdentity;
          const isPrivate = msg.target !== 'all';
          return (
            <div key={msg.id}>
              <span className="tabular text-muted">{formatTime(msg.timestamp)}</span>
              {' '}
              {isPrivate && <span className="text-accent-text">(個別)</span>}
              <span className={isMe ? 'font-semibold text-ink' : 'text-accent-text'}>
                {getDisplayName(msg.sender, students)}:
              </span>
              {' '}
              <span className="text-ink">{msg.text}</span>
            </div>
          );
        })}
      </div>

      {/* 入力 + チャットボタン */}
      <div className="flex gap-2 border-t border-line p-2">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力"
          aria-label="チャットのメッセージ"
          className="min-w-0 flex-1 rounded-md border border-field-line bg-ground px-2 py-1.5 text-[13px] text-ink placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-[13px] font-bold text-accent-ink transition-colors duration-150 disabled:bg-raised disabled:text-muted"
        >
          送信
        </button>
      </div>
    </div>
  );
}
