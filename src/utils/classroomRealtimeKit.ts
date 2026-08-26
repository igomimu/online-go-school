import RealtimeKitClient from '@cloudflare/realtimekit';
import { getSavedDeviceId } from './mediaDevices';
import { ConnectionState, LATEST_ONLY_TYPES, RELIABLE_TYPES } from './classroomRtc';
import type {
  AudioDebugInfo,
  ClassroomConnectOptions,
  ClassroomEventHandler,
  ClassroomMessage,
  ClassroomRtc,
  ParticipantInfo,
  VideoTrackInfo,
} from './classroomRtc';

type Meeting = Awaited<ReturnType<typeof RealtimeKitClient.init>>;
type RemotePeer = Meeting['participants']['joined'] extends { get(id: string): infer P }
  ? NonNullable<P>
  : never;

/**
 * 送信の頻度上限。既定は毎秒5回で、碁盤のカーソル共有（交点を跨ぐたびに送る）は
 * 簡単に超える。超えた分は握り潰されず例外になるので、最初に引き上げておく。
 *
 * 🔴 第2引数は**秒**。ミリ秒だと思って 1000 を渡していたため、実際には
 * 「1000秒(16分40秒)につき60回」になっていた。しかも固定窓なので、60通を
 * 使い切った瞬間から16分間、送信が全部その場で例外になる
 * （2026-08-26 実授業。検討で20〜25手進めると以降なにも届かなくなり、
 *  リロードするまで回復しない。カウンタは SDK 内部に持たれていて
 *  繋ぎ直しでは消えない）。
 *
 * 「毎秒60回まで通った」という実測も、固定窓の最初の60通を見ていただけだった。
 */
const RATE_LIMIT_PER_SEC = 60;
const RATE_LIMIT_WINDOW_SEC = 1;

/**
 * 送信の間隔。上限（毎秒 RATE_LIMIT_PER_SEC 回）に対して半分以下に抑え、
 * 何種類のメッセージが同時に飛んでも触れないようにする。
 */
const SEND_INTERVAL_MS = 40;

/** 上限に当たってしまったときに、次を試すまで置く時間 */
const RETRY_BACKOFF_MS = 1200;

/**
 * 「回線が不安定です」を出すまでの猶予。
 * これより短い揺れは、利用者から見れば何も起きていないのと同じ。
 */
const UNSTABLE_GRACE_MS = 4000;

type QueuedMessage = { msg: ClassroomMessage; participantIds?: string[]; retried?: boolean };

/**
 * Cloudflare RealtimeKit 版の教室。
 *
 * LiveKit 版と挙動が違って必ず引っかかる点が2つあるので、ここで吸収する:
 *
 *  1. **自分の送信が自分にも届く**。LiveKit は届かない。
 *     受け取って返事を返す作りだと自分と無限に往復するので、送り主を見て捨てる。
 *  2. **payload は平たいオブジェクトしか送れない**（値は真偽値・数値・文字列・日付）。
 *     盤面は二次元配列を含むので JSON 文字列にして 1 項目へ詰める。
 *     1通あたり 128KB までは実測で通っている（19路の盤面は 2KB 弱）。
 */
export class ClassroomRealtimeKit implements ClassroomRtc {
  private meeting: Meeting | null = null;
  private handlers: ClassroomEventHandler = {};
  private _videoElements = new Map<string, HTMLVideoElement>();
  private _audioElements = new Map<string, HTMLAudioElement>();
  private _state: ConnectionState = ConnectionState.Disconnected;
  /** 生徒側で「先生の声を止める」を効かせるための現在値 */
  private remoteAudioEnabled = true;

  onVideoTrackChanged?: (info: VideoTrackInfo) => void;
  onAudioTracksChanged?: () => void;
  onSendError?: (info: { type: string; message: string; pending: number }) => void;

  setHandlers(handlers: ClassroomEventHandler) {
    this.handlers = handlers;
  }

  async connect({ token }: ClassroomConnectOptions): Promise<void> {
    this.setState(ConnectionState.Connecting);
    const meeting = await RealtimeKitClient.init({
      authToken: token,
      defaults: {
        audio: false,
        video: false,
        mediaConfiguration: {
          audio: {
            echoCancellation: true,
            // 🔴 SDK 側の綴りが `noiseSupression`（p が1つ）。正しい綴りで書くと
            // 型で弾かれるだけでなく、SDK が読まないので雑音抑制が効かない
            noiseSupression: true,
            autoGainControl: true,
          },
        },
      },
    });
    this.meeting = meeting;
    this.setupEventListeners(meeting);

    await meeting.join();
    meeting.participants.updateRateLimits(RATE_LIMIT_PER_SEC, RATE_LIMIT_WINDOW_SEC);

    // 「回線復旧」で作り直しても、選んだマイク・カメラを使い続ける
    await this.applySavedDevices();

    // 入室した時点で既に居る人はイベントが飛ばないので、ここで拾っておく
    this.remotePeers().forEach((p) => {
      this.attachRemoteTracks(p);
      this.watchPeerMedia(p);
    });

    this.setState(ConnectionState.Connected);
    this.notifyParticipantsChanged();
  }

  /** 短い揺れを画面に出さないための猶予 */
  private unstableTimer: ReturnType<typeof setTimeout> | null = null;

  private clearUnstableTimer() {
    if (this.unstableTimer) {
      clearTimeout(this.unstableTimer);
      this.unstableTimer = null;
    }
  }

  private reportUnstableAfterGrace(state: ConnectionState) {
    if (this.unstableTimer) return;
    this.unstableTimer = setTimeout(() => {
      this.unstableTimer = null;
      this.setState(state);
    }, UNSTABLE_GRACE_MS);
  }

  private setState(state: ConnectionState) {
    // 落ち着いた状態が確定したら、様子見は取り消す
    if (state === ConnectionState.Connected) this.clearUnstableTimer();
    if (this._state === state) return;
    this._state = state;
    this.handlers.onConnectionStateChanged?.(state);
  }

  /**
   * 自分以外の参加者。
   *
   * 🔴 `participants.joined` に自分が入っていることがあり、そのまま並べると
   * 参加者一覧に自分が2人出る（2026-08-26 実授業で発覚）。
   * 含まれていても含まれていなくても正しくなるよう、必ずここで除く。
   */
  private remotePeers(): RemotePeer[] {
    const me = this.meeting?.self.id;
    const myIdentity = this.localIdentity;
    return (this.meeting?.participants.joined.toArray() ?? []).filter(
      (p) => p.id !== me && this.identityOf(p) !== myIdentity,
    );
  }

  /** peerId から identity を引く。覚えず、そのつど今の参加者を見る */
  private identityOfPeerId(peerId: string): string {
    const hit = (this.meeting?.participants.joined.toArray() ?? [])
      .find((p) => p.id === peerId);
    return hit ? this.identityOf(hit) : peerId;
  }

  /**
   * アプリが使う identity。トークン発行時に custom_participant_id へ入れてある
   * （api/token.ts）。無ければ peerId で代用する。
   */
  private identityOf(p: { id: string; customParticipantId?: string }): string {
    return p.customParticipantId || p.id;
  }

  private setupEventListeners(meeting: Meeting) {
    meeting.participants.on('broadcastedMessage', ({ type, payload }) => {
      // 🔴 自分の送信も返ってくる。返事を返す種類のメッセージが無限に往復するので捨てる
      const from = typeof payload.from === 'string' ? payload.from : '';
      if (from && from === meeting.self.id) return;
      try {
        const raw = typeof payload.d === 'string' ? payload.d : 'null';
        const msg: ClassroomMessage = { type: type as ClassroomMessage['type'], payload: JSON.parse(raw) };
        this.handlers.onMessage?.(msg, this.identityOfPeerId(from));
      } catch {
        // 壊れたデータは黙って捨てる（LiveKit 版と同じ）
      }
    });

    meeting.participants.joined.on('participantJoined', (p) => {
      this.handlers.onParticipantJoined?.(this.identityOf(p), p.name);
      this.attachRemoteTracks(p);
      this.watchPeerMedia(p);
      this.notifyParticipantsChanged();
    });

    meeting.participants.joined.on('participantLeft', (p) => {
      const identity = this.identityOf(p);
      this.detachRemote(identity);
      this.handlers.onParticipantLeft?.(identity, p.name);
      this.notifyParticipantsChanged();
    });

    meeting.participants.on('activeSpeaker', ({ peerId }) => {
      const identity = this.identityOfPeerId(peerId);
      this.handlers.onActiveSpeakersChanged?.(identity ? [identity] : []);
    });

    meeting.self.on('roomJoined', ({ reconnected }) => {
      this.setState(ConnectionState.Connected);
      if (reconnected) this.handlers.onReconnected?.();
    });

    meeting.self.on('roomLeft', () => {
      this.setState(ConnectionState.Disconnected);
    });

    // 🔴 RealtimeKit は socket の状態を細かく知らせてくる。そのまま画面へ流すと
    // 一瞬の揺れでも「回線が不安定です」が出て、実際より頻繁に見える
    // （2026-08-26 実授業。LiveKit はもっと落ち着いた通知だった）。
    // つながり直しは少し様子を見てから伝える。すぐ戻れば何も出さない。
    meeting.meta.on('socketConnectionUpdate', ({ state }) => {
      if (state === 'connected') {
        this.clearUnstableTimer();
        this.setState(ConnectionState.Connected);
        return;
      }
      const next = state === 'reconnecting'
        ? ConnectionState.Reconnecting
        : ConnectionState.Disconnected;
      this.reportUnstableAfterGrace(next);
    });

    // 自分の映像・音声
    //
    // 🔴 カメラを切っても映像の枠は残す。LiveKit はトラックを消音にするだけで
    // 黒い四角が残り、その上に「カメラ オフ」を被せる作りになっている。
    // ここで枠ごと消すと、画面から自分のタイルが消えて札も出ない。
    meeting.self.on('videoUpdate', ({ videoEnabled, videoTrack }) => {
      const identity = this.localIdentity;
      if (videoEnabled && videoTrack) {
        const el = this.ensureVideoElement(identity, videoTrack);
        this.onVideoTrackChanged?.({ identity, element: el, isLocal: true });
      }
      this.notifyParticipantsChanged();
    });

    meeting.self.on('audioUpdate', () => {
      this.onAudioTracksChanged?.();
      this.notifyParticipantsChanged();
    });

    this.remotePeers().forEach((p) => this.watchPeerMedia(p));
  }

  /** 相手ごとの映像・音声の増減を追う */
  private watchPeerMedia(p: RemotePeer) {
    const identity = this.identityOf(p);
    p.on('videoUpdate', ({ videoEnabled, videoTrack }) => {
      // 切られても枠は残す（上に「カメラ オフ」が被る）。消すのは退室のとき
      if (videoEnabled && videoTrack) {
        const el = this.ensureVideoElement(identity, videoTrack);
        this.onVideoTrackChanged?.({ identity, element: el, isLocal: false });
      }
      this.notifyParticipantsChanged();
    });
    p.on('audioUpdate', ({ audioEnabled, audioTrack }) => {
      if (audioEnabled && audioTrack) this.ensureAudioElement(identity, audioTrack);
      else this.removeAudioElement(identity);
      this.onAudioTracksChanged?.();
      this.notifyParticipantsChanged();
    });
  }

  private attachRemoteTracks(p: RemotePeer) {
    const identity = this.identityOf(p);
    if (p.videoEnabled && p.videoTrack) {
      const el = this.ensureVideoElement(identity, p.videoTrack);
      this.onVideoTrackChanged?.({ identity, element: el, isLocal: false });
    }
    if (p.audioEnabled && p.audioTrack) {
      this.ensureAudioElement(identity, p.audioTrack);
      this.onAudioTracksChanged?.();
    }
  }

  private ensureVideoElement(identity: string, track: MediaStreamTrack): HTMLVideoElement {
    let el = this._videoElements.get(identity);
    if (!el) {
      el = document.createElement('video');
      el.autoplay = true;
      el.playsInline = true;
      el.muted = true; // 音は audio 要素側で鳴らす
      this._videoElements.set(identity, el);
    }
    el.srcObject = new MediaStream([track]);
    el.play().catch(() => {});
    return el;
  }

  private removeVideoElement(identity: string) {
    const el = this._videoElements.get(identity);
    if (!el) return;
    el.srcObject = null;
    el.remove();
    this._videoElements.delete(identity);
  }

  private ensureAudioElement(identity: string, track: MediaStreamTrack): HTMLAudioElement {
    let el = this._audioElements.get(identity);
    if (!el) {
      el = document.createElement('audio');
      el.id = `audio-${identity}`;
      el.autoplay = true;
      document.body.appendChild(el);
      this._audioElements.set(identity, el);
    }
    el.srcObject = new MediaStream([track]);
    track.enabled = this.remoteAudioEnabled;
    el.play().catch(() => {});
    return el;
  }

  private removeAudioElement(identity: string) {
    const el = this._audioElements.get(identity);
    if (!el) return;
    el.srcObject = null;
    el.remove();
    this._audioElements.delete(identity);
  }

  private detachRemote(identity: string) {
    this.removeVideoElement(identity);
    this.removeAudioElement(identity);
  }

  async disconnect(): Promise<void> {
    await this.meeting?.leave();
    this.setState(ConnectionState.Disconnected);
  }

  get connectionState(): ConnectionState {
    return this._state;
  }

  get isConnected(): boolean {
    return this._state === ConnectionState.Connected;
  }

  get localIdentity(): string {
    const self = this.meeting?.self;
    if (!self) return '';
    return self.customParticipantId || self.id;
  }

  get participants(): ParticipantInfo[] {
    const meeting = this.meeting;
    if (!meeting) return [];
    const list: ParticipantInfo[] = [{
      identity: this.localIdentity,
      isSpeaking: false,
      audioEnabled: meeting.self.audioEnabled,
      videoEnabled: meeting.self.videoEnabled,
      name: meeting.self.name,
    }];
    this.remotePeers().forEach((p) => {
      list.push({
        identity: this.identityOf(p),
        isSpeaking: false,
        audioEnabled: p.audioEnabled,
        videoEnabled: p.videoEnabled,
        name: p.name,
      });
    });
    return list;
  }

  get remoteIdentities(): string[] {
    return this.remotePeers().map((p) => this.identityOf(p));
  }

  get remoteParticipantCount(): number {
    return this.remotePeers().length;
  }

  async broadcast(msg: ClassroomMessage): Promise<void> {
    await this.send(msg);
  }

  /**
   * `null`/未指定なら全員へ、**空配列なら誰にも送らない**。
   * 空配列を「全員」の意味にすると、配信先を一人ずつ外していって最後の一人を外した
   * 瞬間に全員へ配信される、という逆の挙動になる（2026-08-05）。
   */
  async sendToOrAll(msg: ClassroomMessage, identities?: string[] | null): Promise<void> {
    if (identities === null || identities === undefined) {
      await this.broadcast(msg);
      return;
    }
    if (identities.length === 0) return;
    await this.sendTo(msg, identities);
  }

  /**
   * 🔴 宛先は覚えたものを使わず、送るたびに今の参加者から引く。
   *
   * RealtimeKit の participantId は入り直すたびに変わる。入退室のイベントで
   * 覚えておく作りにしていたら、生徒が入り直したあと古いIDへ送り続け、
   * **先生の画面には入室して見えるのにメッセージだけ誰にも届かない**状態になった
   * （2026-08-26 実授業で発覚。検討を閉じても生徒の画面に残り続けた）。
   */
  async sendTo(msg: ClassroomMessage, identities: string[]): Promise<void> {
    const participantIds = this.remotePeers()
      .filter((p) => identities.includes(this.identityOf(p)))
      .map((p) => p.id);
    if (participantIds.length === 0) return;
    await this.send(msg, participantIds);
  }

  /**
   * 送信は必ずここを通し、まとめて上限の内側に収める。
   *
   * 🔴 種類ごとに間引くやり方では足りなかった（2026-08-26 実授業）。
   * 検討中は盤面・カーソル・カーソル消去・AI分析が同時に飛び、それぞれは
   * 控えめでも合計で上限を超える。超えた分は例外になり、そこから先が
   * 生徒に一切届かなくなる。しかも先生側は何事もなく操作できてしまう。
   *
   * 一本の流れにして、
   *  - 「最新だけ届けばよい」もの（盤面・カーソル）は、同じ宛先の古い要求を捨てる
   *  - 「必ず届ける」もの（検討の開始終了、権限、チャットなど）は順に送る
   *  - 一定の間隔でしか送らないので、種類がいくつ増えても上限に触れない
   */
  private latest = new Map<string, QueuedMessage>();
  private mustDeliver: QueuedMessage[] = [];
  private pumpTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSentAt = 0;

  private enqueue(msg: ClassroomMessage, participantIds?: string[]): void {
    const item: QueuedMessage = { msg, participantIds };
    // 盤面やカーソルのように「そのときの状態」を送るものは、同じ種類・同じ宛先の
    // 古い要求を捨てて最新だけ残す。順番に全部届ける必要はない
    if (LATEST_ONLY_TYPES.has(msg.type)) {
      this.latest.set(`${msg.type}|${(participantIds ?? []).join(',')}`, item);
    } else if (RELIABLE_TYPES.has(msg.type)) {
      this.mustDeliver.push(item);
    } else {
      this.latest.set(`${msg.type}|${(participantIds ?? []).join(',')}`, item);
    }
    this.schedulePump();
  }

  private schedulePump(): void {
    if (this.pumpTimer) return;
    const wait = Math.max(0, SEND_INTERVAL_MS - (Date.now() - this.lastSentAt));
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      void this.pump();
    }, wait);
  }

  private async pump(): Promise<void> {
    // 必ず届けるものを先に。次に、溜まっている最新の状態
    const next = this.mustDeliver.shift() ?? this.takeLatest();
    if (!next) return;
    this.lastSentAt = Date.now();
    await this.deliver(next.msg, next.participantIds, next.retried);
    if (this.mustDeliver.length > 0 || this.latest.size > 0) this.schedulePump();
  }

  private takeLatest(): QueuedMessage | undefined {
    const first = this.latest.entries().next();
    if (first.done) return undefined;
    this.latest.delete(first.value[0]);
    return first.value[1];
  }

  private async deliver(msg: ClassroomMessage, participantIds?: string[], retried = false): Promise<void> {
    const meeting = this.meeting;
    if (!meeting) return;
    const body = { d: JSON.stringify(msg.payload ?? null), from: meeting.self.id };
    try {
      await meeting.participants.broadcastMessage(
        msg.type,
        body,
        participantIds ? { participantIds } : undefined,
      );
    } catch (err) {
      // 呼び出し側の多くは void で投げっぱなしにするので、ここで拾わないと
      // 「ある時点から相手に何も届かない」が誰にも気づかれないまま進む
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[rtc] ${msg.type} を送れませんでした:`, message);
      this.onSendError?.({
        type: msg.type,
        message,
        pending: this.mustDeliver.length + this.latest.size,
      });
      // 🔴 盤面のように「最新だけでよい」ものを、失敗したからといって
      // 順番待ちの列へ移してはいけない。失敗が続くとそちらが積み上がり、
      // 優先されるので新しい盤面が永久に送られなくなる
      // （2026-08-26 実授業。25手前後で生徒の受信が止まった）。
      // 同じ置き場へ戻し、次の更新が来ればそれに上書きされるに任せる。
      if (LATEST_ONLY_TYPES.has(msg.type)) {
        const key = `${msg.type}|${(participantIds ?? []).join(',')}`;
        if (!this.latest.has(key)) this.latest.set(key, { msg, participantIds, retried: true });
        this.lastSentAt = Date.now() + RETRY_BACKOFF_MS;
        this.schedulePump();
        return;
      }
      // 落としてはいけないものは、間を置いて列の後ろへ回す。
      // 先頭に戻すと、同じものが失敗し続けたとき列全体が止まる。
      // 送り直しは1度だけ（retried 済みのものは捨てる）。
      if (RELIABLE_TYPES.has(msg.type) && !retried) {
        this.mustDeliver.push({ msg, participantIds, retried: true });
        this.lastSentAt = Date.now() + RETRY_BACKOFF_MS;
        this.schedulePump();
      }
    }
  }

  private async send(msg: ClassroomMessage, participantIds?: string[]): Promise<void> {
    this.enqueue(msg, participantIds);
  }

  async switchDevice(kind: 'audioinput' | 'videoinput', deviceId: string): Promise<void> {
    const meeting = this.meeting;
    if (!meeting) return;
    const device = await meeting.self.getDeviceById(
      deviceId,
      kind === 'audioinput' ? 'audio' : 'video',
    );
    if (device) await meeting.self.setDevice(device);
  }

  async applySavedDevices(): Promise<void> {
    for (const kind of ['audioinput', 'videoinput'] as const) {
      const saved = getSavedDeviceId(kind);
      if (!saved) continue;
      try {
        await this.switchDevice(kind, saved);
      } catch (err) {
        // 前に選んだ機器が外れていることがある。既定のまま続ける
        console.warn(`[media] 保存された${kind}を使えませんでした`, err);
      }
    }
  }

  // 自分でマイク・カメラを操作したときは、イベント待ちにせずその場で知らせる。
  // `videoUpdate` / `audioUpdate` が切ったときに飛ばないことがあり、
  // 画面の「カメラ オフ」が被らないまま黒い四角が残る（2026-08-26 E2E で検出）。
  async enableMicrophone(): Promise<void> {
    await this.meeting?.self.enableAudio();
    this.notifyParticipantsChanged();
  }

  async disableMicrophone(): Promise<void> {
    await this.meeting?.self.disableAudio();
    this.notifyParticipantsChanged();
  }

  async toggleMicrophone(): Promise<boolean> {
    const current = this.isMicrophoneEnabled;
    if (current) await this.disableMicrophone();
    else await this.enableMicrophone();
    return !current;
  }

  async enableCamera(): Promise<void> {
    await this.meeting?.self.enableVideo();
    this.notifyParticipantsChanged();
  }

  async disableCamera(): Promise<void> {
    await this.meeting?.self.disableVideo();
    this.notifyParticipantsChanged();
  }

  async toggleCamera(): Promise<boolean> {
    const current = this.isCameraEnabled;
    if (current) await this.disableCamera();
    else await this.enableCamera();
    return !current;
  }

  get isMicrophoneEnabled(): boolean {
    return this.meeting?.self.audioEnabled ?? false;
  }

  get isCameraEnabled(): boolean {
    return this.meeting?.self.videoEnabled ?? false;
  }

  setRemoteAudioEnabled(enabled: boolean): void {
    this.remoteAudioEnabled = enabled;
    this.remotePeers().forEach((p) => {
      if (p.audioTrack) p.audioTrack.enabled = enabled;
    });
  }

  async startAudio(): Promise<void> {
    // RealtimeKit は音声要素を自前で持っているので、鳴らし直すだけでよい
    for (const el of this._audioElements.values()) {
      el.muted = false;
      el.volume = 1;
      await el.play().catch(() => {});
    }
  }

  collectAudioTracks(): MediaStreamTrack[] {
    const tracks: MediaStreamTrack[] = [];
    const mic = this.meeting?.self.audioTrack;
    if (mic) tracks.push(mic);
    this.remotePeers().forEach((p) => {
      if (p.audioTrack) tracks.push(p.audioTrack);
    });
    return tracks;
  }

  getLocalVideoElement(): HTMLVideoElement | undefined {
    return this._videoElements.get(this.localIdentity);
  }

  getVideoElements(): Map<string, HTMLVideoElement> {
    return new Map(this._videoElements);
  }

  getAudioDebugInfo(): AudioDebugInfo {
    const peers = this.remotePeers();
    return {
      remoteCount: peers.length,
      localAudioTrackCount: this.meeting?.self.audioTrack ? 1 : 0,
      remoteAudioTracks: peers.map((p) => ({
        identity: this.identityOf(p),
        trackCount: p.audioTrack ? 1 : 0,
      })),
    };
  }

  private notifyParticipantsChanged() {
    this.handlers.onParticipantsChanged?.(this.participants);
  }

  destroy() {
    if (this.pumpTimer) { clearTimeout(this.pumpTimer); this.pumpTimer = null; }
    this.clearUnstableTimer();
    this.latest.clear();
    this.mustDeliver.length = 0;
    this._videoElements.forEach((el) => { el.srcObject = null; el.remove(); });
    this._videoElements.clear();
    this._audioElements.forEach((el) => { el.srcObject = null; el.remove(); });
    this._audioElements.clear();
    this.meeting?.leave().catch(() => {});
    this.meeting = null;
  }
}
