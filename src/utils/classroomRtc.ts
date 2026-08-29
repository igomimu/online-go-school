/**
 * 教室の映像・音声・データ通信の口。
 *
 * 実装は2つある:
 *   - ClassroomLiveKit    (classroomLiveKit.ts)     LiveKit Cloud
 *   - ClassroomRealtimeKit (classroomRealtimeKit.ts) Cloudflare RealtimeKit
 *
 * どちらを使うかは `VITE_RTC_PROVIDER` で決まる（rtcProvider.ts）。
 * アプリ側はこのインターフェースだけを見る。実装の型を直接 import しない。
 */
import type { BoardState, StoneColor, Marker } from '../components/GoBoard';
import type { GameMessageType } from '../types/game';

/**
 * 接続の状態。値は LiveKit の ConnectionState と同一にしてある
 * （移行中に両方の実装が同じ値を返せるようにするため）。
 */
export const ConnectionState = {
  Disconnected: 'disconnected',
  Connecting: 'connecting',
  Connected: 'connected',
  Reconnecting: 'reconnecting',
  SignalReconnecting: 'signalReconnecting',
} as const;
export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];

export type Role = 'TEACHER' | 'STUDENT';

export interface BoardUpdatePayload {
  boardState: BoardState;
  boardSize: number;
  nextColor: StoneColor;
  markers: Marker[];
  moveNumber: number;
}

export interface CursorPayload {
  x: number;
  y: number;
  identity: string;
}

export interface DrawingPayload {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: 'line' | 'arrow';
}

export type MessageType =
  | 'BOARD_UPDATE'
  | 'AI_ANALYSIS_UPDATE'
  | 'CURSOR_MOVE'
  | 'CURSOR_CLEAR'
  | 'DRAW_UPDATE'
  | 'DRAW_CLEAR'
  | GameMessageType;

export interface ClassroomMessage {
  type: MessageType;
  payload: unknown;
}

export interface ParticipantInfo {
  identity: string;
  isSpeaking: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  name?: string;
}

export type ClassroomEventHandler = {
  onMessage?: (msg: ClassroomMessage, sender?: string) => void;
  // name は配信側の表示名。identity（sid:1000 など）は名簿と照合できないことがあるので、
  // 人が読める名前を出したい側はこちらを使う
  onParticipantJoined?: (identity: string, name?: string) => void;
  onParticipantLeft?: (identity: string, name?: string) => void;
  onParticipantsChanged?: (participants: ParticipantInfo[]) => void;
  onConnectionStateChanged?: (state: ConnectionState) => void;
  onReconnected?: () => void;
  onActiveSpeakersChanged?: (speakers: string[]) => void;
};

export interface VideoTrackInfo {
  identity: string;
  element: HTMLVideoElement | null;
  isLocal: boolean;
}

/**
 * 落としてはいけないメッセージ。
 * LiveKit では reliable フラグに使う。RealtimeKit は経路が1本しかないので区別しない。
 * GAME_* は Supabase 権威型に移行済（2026-04-15）。
 */
export const RELIABLE_TYPES = new Set<string>([
  'BOARD_UPDATE', 'AI_ANALYSIS_UPDATE', 'DRAW_UPDATE', 'DRAW_CLEAR',
  'PROBLEM_ASSIGN', 'PROBLEM_RESULT',
  'REVIEW_START', 'REVIEW_END', 'REVIEW_PERMISSIONS', 'REVIEW_STUDENT_MOVE',
  'NIGIRI_DRAW',
  'AUDIO_CONTROL', 'MEDIA_CONTROL', 'CHAT_MESSAGE', 'RANK_DISPLAY',
]);

/**
 * 「そのときの状態」を送っているだけで、途中を飛ばしても最後の一枚が届けば
 * 正しくなるメッセージ。順番に全部届ける必要はない。
 *
 * 🔴 これを「必ず届ける」側に入れていたため、早送りで大量に積まれ、
 * 送信の上限に当たると先頭を送り直し続けて列が詰まり、以降のすべてが
 * 止まった（2026-08-26 実授業。生徒側が完全に反応しなくなる）。
 */
export const LATEST_ONLY_TYPES = new Set<string>([
  'BOARD_UPDATE', 'AI_ANALYSIS_UPDATE', 'CURSOR_MOVE', 'CURSOR_CLEAR', 'DRAW_UPDATE',
]);

/** 音声の状態を画面に出すための情報（デバッグ表示用） */
export interface AudioDebugInfo {
  remoteCount: number;
  localAudioTrackCount: number;
  /** identity → 購読中の音声トラック数 */
  remoteAudioTracks: Array<{ identity: string; trackCount: number }>;
}

/** 教室に繋ぐための情報。実装ごとに要るものが違うのでまとめて渡す */
export interface ClassroomConnectOptions {
  /** LiveKit のサーバー URL。RealtimeKit では使わない */
  url?: string;
  /** 参加のためのトークン。両実装とも必須 */
  token: string;
}

export interface ClassroomRtc {
  setHandlers(handlers: ClassroomEventHandler): void;

  connect(opts: ClassroomConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  destroy(): void;

  readonly connectionState: ConnectionState;
  readonly isConnected: boolean;
  readonly localIdentity: string;
  readonly participants: ParticipantInfo[];
  readonly remoteIdentities: string[];
  readonly remoteParticipantCount: number;

  broadcast(msg: ClassroomMessage): Promise<void>;
  /** `null`/未指定なら全員へ、**空配列なら誰にも送らない** */
  sendToOrAll(msg: ClassroomMessage, identities?: string[] | null): Promise<void>;
  sendTo(msg: ClassroomMessage, identities: string[]): Promise<void>;

  enableMicrophone(): Promise<void>;
  disableMicrophone(): Promise<void>;
  toggleMicrophone(): Promise<boolean>;
  enableCamera(): Promise<void>;
  disableCamera(): Promise<void>;
  toggleCamera(): Promise<boolean>;
  readonly isMicrophoneEnabled: boolean;
  readonly isCameraEnabled: boolean;

  switchDevice(kind: 'audioinput' | 'videoinput', deviceId: string): Promise<void>;
  applySavedDevices(): Promise<void>;

  /** 相手の声を鳴らすか止める。identities省略時は全員、指定時はその相手だけ */
  setRemoteAudioEnabled(enabled: boolean, identities?: string[]): void;
  /** ブラウザの自動再生制限を解除する。ユーザー操作の中から呼ぶ */
  startAudio(): Promise<void>;

  /** 録画に混ぜるため、いま鳴っている音声トラックを集める */
  collectAudioTracks(): MediaStreamTrack[];
  getLocalVideoElement(): HTMLVideoElement | undefined;
  getVideoElements(): Map<string, HTMLVideoElement>;

  getAudioDebugInfo(): AudioDebugInfo;

  onVideoTrackChanged?: (info: VideoTrackInfo) => void;
  /** 録画中に音声トラックが増減したときに知らせる（途中参加の生徒の声を混ぜるため） */
  onAudioTracksChanged?: () => void;
  /**
   * 送れなかったことを画面に出すために知らせる。
   *
   * 🔴 送信の失敗は呼び出し側の多くが void で投げっぱなしにするので、
   * 今まで誰にも見えなかった。「生徒に届かない」が起きたとき、
   * 送信の問題なのか受け取る側の問題なのか切り分けられず遠回りした
   * （2026-08-26）。
   */
  onSendError?: (info: { type: string; message: string; pending: number }) => void;
}
