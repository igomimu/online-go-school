import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ChatMessagePayload } from '../types/chat';
import type { ClassroomLiveKit, ClassroomMessage } from '../utils/classroomLiveKit';

export function useChat(classroomRef: React.RefObject<ClassroomLiveKit | null>) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const isVisibleRef = useRef(true);

  const sendMessage = useCallback(async (text: string, target: 'all' | string) => {
    const classroom = classroomRef.current;
    if (!classroom?.isConnected || !text.trim()) return;

    const msg: ChatMessagePayload = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      sender: classroom.localIdentity,
      target,
      text: text.trim(),
      timestamp: Date.now(),
    };

    // ローカルに追加
    setMessages(prev => [...prev, msg]);

    // 送信
    const classroomMsg: ClassroomMessage = {
      type: 'CHAT_MESSAGE',
      payload: msg,
    };

    if (target === 'all') {
      await classroom.broadcast(classroomMsg);
    } else {
      await classroom.sendTo(classroomMsg, [target]);
    }
  }, [classroomRef]);

  const handleChatMessage = useCallback((payload: ChatMessagePayload) => {
    const msg: ChatMessage = {
      id: payload.id,
      sender: payload.sender,
      target: payload.target,
      text: payload.text,
      timestamp: payload.timestamp,
    };
    setMessages(prev => [...prev, msg]);

    if (!isVisibleRef.current) {
      setUnreadCount(prev => prev + 1);
    }
  }, []);

  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const setVisible = useCallback((visible: boolean) => {
    isVisibleRef.current = visible;
    if (visible) setUnreadCount(0);
  }, []);

  return {
    messages,
    unreadCount,
    sendMessage,
    handleChatMessage,
    markAsRead,
    setVisible,
  };
}
