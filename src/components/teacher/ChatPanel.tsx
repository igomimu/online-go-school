import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';

interface ChatPanelProps {
  messages: ChatMessage[];
  participants: ParticipantInfo[];
  localIdentity: string;
  onSend: (text: string, target: 'all' | string) => void;
}

export default function ChatPanel({
  messages,
  participants,
  localIdentity,
  onSend,
}: ChatPanelProps) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState<'all' | string>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新しいメッセージで自動スクロール
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
    <div className="flex flex-col h-full">
      {/* 送信先 */}
      <div className="px-3 py-2 border-b border-white/5">
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs focus:outline-none focus:border-indigo-500"
        >
          <option value="all">生徒全員</option>
          {remoteParticipants.map(p => (
            <option key={p.identity} value={p.identity}>
              {p.identity}
            </option>
          ))}
        </select>
      </div>

      {/* メッセージ表示 */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0">
        {messages.length === 0 && (
          <div className="text-xs text-zinc-600 text-center py-4">
            チャットメッセージはここに表示されます
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.sender === localIdentity;
          const isPrivate = msg.target !== 'all';
          return (
            <div key={msg.id} className={`text-xs ${isMe ? 'text-zinc-300' : 'text-zinc-200'}`}>
              <span className="text-zinc-600">[{formatTime(msg.timestamp)}]</span>
              {' '}
              {isPrivate && <span className="text-indigo-400">(個別)</span>}
              {' '}
              <span className={isMe ? 'text-indigo-300' : 'text-amber-300'}>
                {msg.sender}:
              </span>
              {' '}
              {msg.text}
            </div>
          );
        })}
      </div>

      {/* 入力 */}
      <div className="p-2 border-t border-white/5 flex gap-1">
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージ..."
          className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white disabled:opacity-30 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
