import type { BoardState, StoneColor } from '../components/GoBoard';

// === 対局セッション ===
export interface GameSession {
  id: string;
  blackPlayer: string;     // identity
  whitePlayer: string;
  boardSize: number;        // 9, 13, 19
  handicap: number;         // 0-9
  komi: number;             // 6.5等
  status: 'playing' | 'finished';
  boardState: BoardState;
  currentColor: StoneColor;
  moveNumber: number;
  moveHistory: GameMove[];
  blackCaptures: number;
  whiteCaptures: number;
  result?: string;          // "B+R", "W+3.5"等
  lastBoardHash?: string;   // コウ検出用
}

export interface GameMove {
  x: number;
  y: number;
  color: StoneColor;
}

// === 保存棋譜 ===
export interface SavedGame {
  id: string;
  date: string;
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  handicap: number;
  komi: number;
  result: string;
  sgf: string;
}

// === 音声制御 ===
export interface AudioPermissions {
  [identity: string]: {
    canHear: boolean;
    micAllowed: boolean;
    cameraAllowed: boolean;
  };
}

// === 画面状態 ===
export type ViewMode = 'lobby' | 'game' | 'review' | 'lecture';

// === DataChannelメッセージ ===
export type GameMessageType =
  | 'GAME_CREATED'
  | 'GAME_MOVE'
  | 'GAME_BOARD_UPDATE'
  | 'GAME_PASS'
  | 'GAME_RESIGN'
  | 'GAME_ENDED'
  | 'GAME_LIST_SYNC'
  | 'REVIEW_START'
  | 'REVIEW_END'
  | 'AUDIO_CONTROL'
  | 'MEDIA_CONTROL';

export interface GameCreatedPayload {
  game: GameSession;
}

export interface GameMovePayload {
  gameId: string;
  x: number;
  y: number;
  color: StoneColor;
}

export interface GameBoardUpdatePayload {
  gameId: string;
  boardState: BoardState;
  currentColor: StoneColor;
  moveNumber: number;
  blackCaptures: number;
  whiteCaptures: number;
  lastMove?: GameMove;
}

export interface GamePassPayload {
  gameId: string;
  color: StoneColor;
}

export interface GameResignPayload {
  gameId: string;
  color: StoneColor;
}

export interface GameEndedPayload {
  gameId: string;
  result: string;
}

export interface GameListSyncPayload {
  games: GameSession[];
}

export interface ReviewStartPayload {
  sgf: string;
  boardSize: number;
  targetStudents: string[];  // 空配列 = 全員
}

export interface ReviewEndPayload {
  // empty
}

export interface AudioControlPayload {
  canHear: boolean;
}

export interface MediaControlPayload {
  micAllowed: boolean;
  cameraAllowed: boolean;
}
