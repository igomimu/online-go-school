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
    <div className="flex flex-col h-full" style={{ background: '#1c1c20', fontFamily: 'var(--font-inter)' }}>
      {/* 送信先 + トークルーム（先生のみ） */}
      {showTargetSelector && (
        <div style={{ padding: '4px 6px', borderBottom: '1px solid #27272a', display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            style={{
              flex: 1,
              border: '1px solid #3f3f46',
              background: '#27272a',
              color: '#e4e4e7',
              fontSize: 12,
              padding: '2px 4px',
            }}
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
        style={{
          flex: 1,
          overflowY: 'auto',
          background: '#141416',
          color: '#e4e4e7',
          padding: 4,
          fontSize: 11,
          minHeight: 0,
        }}
      >
        {messages.map(msg => {
          const isMe = msg.sender === localIdentity;
          const isPrivate = msg.target !== 'all';
          return (
            <div key={msg.id}>
              <span style={{ color: '#71717a' }}>[{formatTime(msg.timestamp)}]</span>
              {' '}
              {isPrivate && <span style={{ color: '#d4d4d8' }}>(個別)</span>}
              <span style={{ color: isMe ? '#fbbf24' : '#f59e0b' }}>
                {getDisplayName(msg.sender, students)}:
              </span>
              {' '}
              {msg.text}
            </div>
          );
        })}
      </div>

      {/* 入力 + チャットボタン */}
      <div style={{ display: 'flex', gap: 2, padding: 4, borderTop: '1px solid #27272a' }}>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            border: '1px solid #3f3f46',
            background: '#27272a',
            color: '#e4e4e7',
            fontSize: 11,
            padding: '2px 4px',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          style={{
            padding: '2px 12px',
            fontSize: 12,
            fontWeight: 'bold',
            border: '1px solid #f59e0b',
            background: '#d97706',
            color: '#fff',
            cursor: text.trim() ? 'pointer' : 'default',
            opacity: text.trim() ? 1 : 0.5,
          }}
        >
          チャット
        </button>
      </div>
    </div>
  );
}
