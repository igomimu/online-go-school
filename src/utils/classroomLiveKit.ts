import {
  Room,
  RoomEvent,
  RemoteParticipant,
  ConnectionState,
  type Participant,
} from 'livekit-client';
import type { BoardState, StoneColor, Marker } from '../components/GoBoard';

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

export interface ClassroomMessage {
  type: 'BOARD_UPDATE' | 'CURSOR_MOVE' | 'CURSOR_CLEAR';
  payload: BoardUpdatePayload | CursorPayload | null;
}

export interface ParticipantInfo {
  identity: string;
  isSpeaking: boolean;
  audioEnabled: boolean;
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

    this.room.on(RoomEvent.TrackMuted, () => this.notifyParticipantsChanged());
    this.room.on(RoomEvent.TrackUnmuted, () => this.notifyParticipantsChanged());
  }

  setHandlers(handlers: ClassroomEventHandler) {
    this.handlers = handlers;
  }

  async connect(url: string, token: string): Promise<void> {
    await this.room.connect(url, token);
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

    // Local participant
    const local = this.room.localParticipant;
    if (local) {
      list.push({
        identity: local.identity,
        isSpeaking: local.isSpeaking,
        audioEnabled: local.isMicrophoneEnabled,
      });
    }

    // Remote participants
    this.room.remoteParticipants.forEach((p) => {
      list.push({
        identity: p.identity,
        isSpeaking: p.isSpeaking,
        audioEnabled: p.isMicrophoneEnabled,
      });
    });

    return list;
  }

  get remoteParticipantCount(): number {
    return this.room.remoteParticipants.size;
  }

  async broadcast(msg: ClassroomMessage): Promise<void> {
    const data = encoder.encode(JSON.stringify(msg));
    await this.room.localParticipant.publishData(data, {
      reliable: msg.type === 'BOARD_UPDATE',
      topic: msg.type,
    });
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

  get isMicrophoneEnabled(): boolean {
    return this.room.localParticipant?.isMicrophoneEnabled ?? false;
  }

  private notifyParticipantsChanged() {
    this.handlers.onParticipantsChanged?.(this.participants);
  }

  destroy() {
    this.room.disconnect();
  }
}
