import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  ConnectionState,
  Track,
  type Participant,
} from 'livekit-client';
import type { BoardState, StoneColor, Marker } from '../components/GoBoard';
import type { GameMessageType } from '../types/game';

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

// 既存 + 新規メッセージタイプ
export type MessageType =
  | 'BOARD_UPDATE'
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
}

export type ClassroomEventHandler = {
  onMessage?: (msg: ClassroomMessage, sender?: string) => void;
  onParticipantJoined?: (identity: string) => void;
  onParticipantLeft?: (identity: string) => void;
  onParticipantsChanged?: (participants: ParticipantInfo[]) => void;
  onConnectionStateChanged?: (state: ConnectionState) => void;
  onActiveSpeakersChanged?: (speakers: string[]) => void;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// 信頼性が必要なメッセージタイプ
const RELIABLE_TYPES = new Set<string>([
  'BOARD_UPDATE', 'DRAW_UPDATE', 'DRAW_CLEAR',
  'GAME_CREATED', 'GAME_BOARD_UPDATE', 'GAME_ENDED',
  'GAME_LIST_SYNC', 'REVIEW_START', 'REVIEW_END',
  'AUDIO_CONTROL', 'MEDIA_CONTROL',
]);

export class ClassroomLiveKit {
  room: Room;
  private handlers: ClassroomEventHandler = {};

  constructor() {
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
    });
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.room.on(RoomEvent.DataReceived, (
      payload: Uint8Array,
      participant?: RemoteParticipant,
    ) => {
      try {
        const msg = JSON.parse(decoder.decode(payload)) as ClassroomMessage;
        this.handlers.onMessage?.(msg, participant?.identity);
      } catch {
        // ignore malformed data
      }
    });

    this.room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      this.handlers.onParticipantJoined?.(participant.identity);
      this.notifyParticipantsChanged();
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.handlers.onParticipantLeft?.(participant.identity);
      this.notifyParticipantsChanged();
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      this.handlers.onConnectionStateChanged?.(state);
    });

    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      this.handlers.onActiveSpeakersChanged?.(speakers.map(s => s.identity));
    });

    this.room.on(RoomEvent.TrackSubscribed, (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind === Track.Kind.Audio) {
        const el = track.attach();
        el.id = `audio-${participant.identity}`;
        document.body.appendChild(el);
      }
      if (track.kind === Track.Kind.Video) {
        this.notifyParticipantsChanged();
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (
      track: RemoteTrack,
    ) => {
      track.detach().forEach(el => el.remove());
    });

    this.room.on(RoomEvent.TrackMuted, () => this.notifyParticipantsChanged());
    this.room.on(RoomEvent.TrackUnmuted, () => this.notifyParticipantsChanged());
  }

  setHandlers(handlers: ClassroomEventHandler) {
    this.handlers = handlers;
  }

  async connect(url: string, token: string): Promise<void> {
    await this.room.connect(url, token);
    await this.room.startAudio();
  }

  async disconnect(): Promise<void> {
    await this.room.disconnect();
  }

  get connectionState(): ConnectionState {
    return this.room.state;
  }

  get isConnected(): boolean {
    return this.room.state === ConnectionState.Connected;
  }

  get localIdentity(): string {
    return this.room.localParticipant?.identity ?? '';
  }

  get participants(): ParticipantInfo[] {
    const list: ParticipantInfo[] = [];

    const local = this.room.localParticipant;
    if (local) {
      list.push({
        identity: local.identity,
        isSpeaking: local.isSpeaking,
        audioEnabled: local.isMicrophoneEnabled,
        videoEnabled: local.isCameraEnabled,
      });
    }

    this.room.remoteParticipants.forEach((p) => {
      list.push({
        identity: p.identity,
        isSpeaking: p.isSpeaking,
        audioEnabled: p.isMicrophoneEnabled,
        videoEnabled: p.isCameraEnabled,
      });
    });

    return list;
  }

  // リモート参加者の名前一覧（先生を除く）
  get remoteIdentities(): string[] {
    const identities: string[] = [];
    this.room.remoteParticipants.forEach((p) => {
      identities.push(p.identity);
    });
    return identities;
  }

  get remoteParticipantCount(): number {
    return this.room.remoteParticipants.size;
  }

  async broadcast(msg: ClassroomMessage): Promise<void> {
    const data = encoder.encode(JSON.stringify(msg));
    await this.room.localParticipant.publishData(data, {
      reliable: RELIABLE_TYPES.has(msg.type),
      topic: msg.type,
    });
  }

  // 特定の参加者にメッセージ送信
  async sendTo(msg: ClassroomMessage, identities: string[]): Promise<void> {
    const data = encoder.encode(JSON.stringify(msg));
    const destinations: RemoteParticipant[] = [];
    this.room.remoteParticipants.forEach((p) => {
      if (identities.includes(p.identity)) {
        destinations.push(p);
      }
    });
    if (destinations.length > 0) {
      await this.room.localParticipant.publishData(data, {
        reliable: RELIABLE_TYPES.has(msg.type),
        topic: msg.type,
        destinationIdentities: identities,
      });
    }
  }

  async enableMicrophone(): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(true);
  }

  async disableMicrophone(): Promise<void> {
    await this.room.localParticipant.setMicrophoneEnabled(false);
  }

  async toggleMicrophone(): Promise<boolean> {
    const current = this.room.localParticipant.isMicrophoneEnabled;
    await this.room.localParticipant.setMicrophoneEnabled(!current);
    return !current;
  }

  async toggleCamera(): Promise<boolean> {
    const current = this.room.localParticipant.isCameraEnabled;
    await this.room.localParticipant.setCameraEnabled(!current);
    return !current;
  }

  get isMicrophoneEnabled(): boolean {
    return this.room.localParticipant?.isMicrophoneEnabled ?? false;
  }

  get isCameraEnabled(): boolean {
    return this.room.localParticipant?.isCameraEnabled ?? false;
  }

  private notifyParticipantsChanged() {
    this.handlers.onParticipantsChanged?.(this.participants);
  }

  destroy() {
    this.room.disconnect();
  }
}
