import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  LocalTrackPublication,
  Track,
  type Participant,
} from 'livekit-client';
import { getSavedDeviceId } from './mediaDevices';
import { ConnectionState, RELIABLE_TYPES } from './classroomRtc';
import type {
  AudioDebugInfo,
  ClassroomConnectOptions,
  ClassroomEventHandler,
  ClassroomMessage,
  ClassroomRtc,
  ParticipantInfo,
  VideoTrackInfo,
} from './classroomRtc';

// 型は classroomRtc.ts が正本。ここからも読めるようにして既存の import を壊さない
export type {
  AudioDebugInfo,
  BoardUpdatePayload,
  ClassroomConnectOptions,
  ClassroomEventHandler,
  ClassroomMessage,
  ClassroomRtc,
  CursorPayload,
  DrawingPayload,
  MessageType,
  ParticipantInfo,
  Role,
  VideoTrackInfo,
} from './classroomRtc';
export { ConnectionState } from './classroomRtc';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class ClassroomLiveKit implements ClassroomRtc {
  room: Room;
  private handlers: ClassroomEventHandler = {};
  private _videoElements = new Map<string, HTMLVideoElement>();
  private _audioElements = new Map<string, HTMLAudioElement>();
  private remoteAudioEnabled = true;
  private remoteAudioOverrides = new Map<string, boolean>();
  onVideoTrackChanged?: (info: VideoTrackInfo) => void;
  /** 録画中に音声トラックが増減したときに知らせる（録画に途中参加の生徒の声を混ぜるため） */
  onAudioTracksChanged?: () => void;

  constructor() {
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
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
      this.handlers.onParticipantJoined?.(participant.identity, participant.name);
      this.notifyParticipantsChanged();
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.handlers.onParticipantLeft?.(participant.identity, participant.name);
      this.notifyParticipantsChanged();
    });

    this.room.on(RoomEvent.ConnectionStateChanged, (state) => {
      this.handlers.onConnectionStateChanged?.(state as ConnectionState);
    });

    this.room.on(RoomEvent.Reconnected, () => {
      this.handlers.onReconnected?.();
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
        track.mediaStreamTrack.enabled = this.remoteAudioOverrides.get(participant.identity)
          ?? this.remoteAudioEnabled;
        const el = track.attach() as HTMLAudioElement;
        el.id = `audio-${participant.identity}`;
        document.body.appendChild(el);
        this._audioElements.set(participant.identity, el);
        this.onAudioTracksChanged?.();
      }
      if (track.kind === Track.Kind.Video) {
        const el = track.attach() as HTMLVideoElement;
        this._videoElements.set(participant.identity, el);
        this.onVideoTrackChanged?.({
          identity: participant.identity,
          element: el,
          isLocal: false,
        });
        this.notifyParticipantsChanged();
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      track.detach().forEach(el => el.remove());
      if (track.kind === Track.Kind.Audio) {
        this._audioElements.delete(participant.identity);
        this.onAudioTracksChanged?.();
      }
      if (track.kind === Track.Kind.Video) {
        this._videoElements.delete(participant.identity);
        this.onVideoTrackChanged?.({
          identity: participant.identity,
          element: null,
          isLocal: false,
        });
      }
    });

    // ローカルビデオトラック公開時
    this.room.on(RoomEvent.LocalTrackPublished, (
      publication: LocalTrackPublication,
    ) => {
      const track = publication.track;
      if (track && track.kind === Track.Kind.Video) {
        const el = track.attach() as HTMLVideoElement;
        const identity = this.room.localParticipant.identity;
        this._videoElements.set(identity, el);
        this.onVideoTrackChanged?.({
          identity,
          element: el,
          isLocal: true,
        });
      }
      if (track && track.kind === Track.Kind.Audio) {
        this.onAudioTracksChanged?.();
      }
      // 自分のマイク・カメラを初めて点けたときは publish であって unmute ではないので、
      // TrackUnmuted は飛ばない。ここで知らせないと参加者一覧の自分だけ「切」のまま残る
      this.notifyParticipantsChanged();
    });

    this.room.on(RoomEvent.LocalTrackUnpublished, (
      publication: LocalTrackPublication,
    ) => {
      const track = publication.track;
      if (track && track.kind === Track.Kind.Video) {
        track.detach().forEach(el => el.remove());
        const identity = this.room.localParticipant.identity;
        this._videoElements.delete(identity);
        this.onVideoTrackChanged?.({
          identity,
          element: null,
          isLocal: true,
        });
      }
      if (track && track.kind === Track.Kind.Audio) {
        this.onAudioTracksChanged?.();
      }
      this.notifyParticipantsChanged();
    });

    this.room.on(RoomEvent.TrackMuted, () => this.notifyParticipantsChanged());
    this.room.on(RoomEvent.TrackUnmuted, () => this.notifyParticipantsChanged());
  }

  setHandlers(handlers: ClassroomEventHandler) {
    this.handlers = handlers;
  }

  async connect({ url, token }: ClassroomConnectOptions): Promise<void> {
    if (!url) throw new Error('LiveKit の接続先URLが設定されていません');
    await this.room.connect(url, token);
    await this.room.startAudio();
    // 「回線復旧」で Room を作り直しても、選んだマイク・カメラを使い続ける
    await this.applySavedDevices();
    // 接続時点で既に room に存在する remote participants は
    // ParticipantConnected イベントを発火させないため、明示的に初回同期を発火する。
    // （後から参加する client 側で初期 participants が React state に反映されない問題の対策）
    this.notifyParticipantsChanged();
  }

  async disconnect(): Promise<void> {
    await this.room.disconnect();
  }

  get connectionState(): ConnectionState {
    return this.room.state as ConnectionState;
  }

  get isConnected(): boolean {
    return (this.room.state as ConnectionState) === ConnectionState.Connected;
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
        name: local.name,
      });
    }

    this.room.remoteParticipants.forEach((p) => {
      list.push({
        identity: p.identity,
        isSpeaking: p.isSpeaking,
        audioEnabled: p.isMicrophoneEnabled,
        videoEnabled: p.isCameraEnabled,
        name: p.name,
      });
    });

    return list;
  }

  /**
   * 録画用に、いま鳴っている音声トラックを集める（自分のマイク＋購読中の生徒の声）。
   *
   * 画面録画の getDisplayMedia は「スピーカーから鳴っている音」しか拾えず、
   * 自分の声はスピーカーから出ないので講師の解説が入らない。LiveKit が持っている
   * トラックから直接集めれば、共有ダイアログのチェックの有無にも左右されない。
   */
  collectAudioTracks(): MediaStreamTrack[] {
    const tracks: MediaStreamTrack[] = [];

    const mic = this.room.localParticipant
      ?.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack;
    if (mic) tracks.push(mic);

    this.room.remoteParticipants.forEach((p) => {
      p.audioTrackPublications.forEach((pub) => {
        const t = pub.track?.mediaStreamTrack;
        if (t) tracks.push(t);
      });
    });

    return tracks;
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
  /**
   * 宛先を絞って送る。`null`/未指定なら全員へ、**空配列なら誰にも送らない**。
   * 検討の「配信先の生徒」はこれを通す（以前は broadcast を呼んでおり、
   * 選んでも全員に配信されていた 2026-08-04）。
   *
   * 空配列を「全員」の意味にすると、生徒を一人ずつ配信先から外していって
   * 最後の一人を外した瞬間に全員へ配信される、という逆の挙動になる（2026-08-05）。
   */
  async sendToOrAll(msg: ClassroomMessage, identities?: string[] | null): Promise<void> {
    if (identities === null || identities === undefined) {
      await this.broadcast(msg);
      return;
    }
    if (identities.length === 0) return;
    await this.sendTo(msg, identities);
  }

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

  /**
   * 使用する機器を切り替える。まだ配信していない種類でも、次に ON にしたとき
   * この選択が使われる（LiveKit が Room の既定機器として覚える）。
   */
  async switchDevice(kind: 'audioinput' | 'videoinput', deviceId: string): Promise<void> {
    await this.room.switchActiveDevice(kind, deviceId);
  }

  /** 保存してある選択を今の Room に当てる。回線復旧で Room を作り直したあとにも呼ぶ */
  async applySavedDevices(): Promise<void> {
    for (const kind of ['audioinput', 'videoinput'] as const) {
      const saved = getSavedDeviceId(kind);
      if (!saved) continue;
      try {
        await this.room.switchActiveDevice(kind, saved);
      } catch (err) {
        // 前に選んだ機器が外れていることがある。既定のまま続ける
        console.warn(`[media] 保存された${kind}を使えませんでした`, err);
      }
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

  async enableCamera(): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(true);
  }

  async disableCamera(): Promise<void> {
    await this.room.localParticipant.setCameraEnabled(false);
  }

  get isMicrophoneEnabled(): boolean {
    return this.room.localParticipant?.isMicrophoneEnabled ?? false;
  }

  get isCameraEnabled(): boolean {
    return this.room.localParticipant?.isCameraEnabled ?? false;
  }

  getLocalVideoElement(): HTMLVideoElement | undefined {
    const identity = this.room.localParticipant?.identity;
    return identity ? this._videoElements.get(identity) : undefined;
  }

  getVideoElements(): Map<string, HTMLVideoElement> {
    return new Map(this._videoElements);
  }

  /** 相手の声を鳴らすか止めるか。購読済みトラックの enabled を直接触る */
  setRemoteAudioEnabled(enabled: boolean, identities?: string[]): void {
    if (identities) {
      identities.forEach(identity => this.remoteAudioOverrides.set(identity, enabled));
    } else {
      this.remoteAudioEnabled = enabled;
      this.remoteAudioOverrides.clear();
    }
    this.room.remoteParticipants.forEach((p) => {
      if (identities && !identities.includes(p.identity)) return;
      p.audioTrackPublications.forEach((pub) => {
        if (pub.track) pub.track.mediaStreamTrack.enabled = enabled;
      });
    });
  }

  /** ブラウザの自動再生制限を解除する。ユーザー操作の中から呼ぶ */
  async startAudio(): Promise<void> {
    await this.room.startAudio();
  }

  getAudioDebugInfo(): AudioDebugInfo {
    const local = this.room.localParticipant;
    const remoteAudioTracks: AudioDebugInfo['remoteAudioTracks'] = [];
    this.room.remoteParticipants.forEach((p) => {
      remoteAudioTracks.push({
        identity: p.identity,
        trackCount: p.audioTrackPublications.size,
      });
    });
    return {
      remoteCount: this.room.remoteParticipants.size,
      localAudioTrackCount: local ? local.audioTrackPublications.size : 0,
      remoteAudioTracks,
    };
  }

  private notifyParticipantsChanged() {
    this.handlers.onParticipantsChanged?.(this.participants);
  }

  destroy() {
    // メディア要素のクリーンアップ
    this._videoElements.forEach(el => el.remove());
    this._videoElements.clear();
    this._audioElements.forEach(el => el.remove());
    this._audioElements.clear();
    this.remoteAudioOverrides.clear();
    this.room.disconnect();
  }
}
