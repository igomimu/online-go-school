// === チャットメッセージ ===
export interface ChatMessage {
  id: string;
  sender: string;        // identity
  target: 'all' | string; // 'all' = 全員, それ以外 = 特定の identity
  text: string;
  timestamp: number;
}

export interface ChatMessagePayload {
  id: string;
  sender: string;
  target: 'all' | string;
  text: string;
  timestamp: number;
}
