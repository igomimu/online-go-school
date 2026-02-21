import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionState } from 'livekit-client';

// livekit-clientをモック
vi.mock('livekit-client', () => {
  const RoomEvent = {
    DataReceived: 'dataReceived',
    ParticipantConnected: 'participantConnected',
    ParticipantDisconnected: 'participantDisconnected',
    ConnectionStateChanged: 'connectionStateChanged',
    ActiveSpeakersChanged: 'activeSpeakersChanged',
    TrackSubscribed: 'trackSubscribed',
    TrackUnsubscribed: 'trackUnsubscribed',
    TrackMuted: 'trackMuted',
    TrackUnmuted: 'trackUnmuted',
  };

  const ConnectionState = {
    Connected: 'connected',
    Disconnected: 'disconnected',
    Connecting: 'connecting',
    Reconnecting: 'reconnecting',
  };

  const Track = {
    Kind: { Audio: 'audio', Video: 'video' },
  };

  // イベントエミッタ
  class MockRoom {
    private listeners = new Map<string, Function[]>();
    state = ConnectionState.Disconnected;
    localParticipant = {
      identity: '三村先生',
      isSpeaking: false,
      isMicrophoneEnabled: false,
      isCameraEnabled: false,
      publishData: vi.fn(),
      setMicrophoneEnabled: vi.fn(),
      setCameraEnabled: vi.fn(),
    };
    remoteParticipants = new Map();

    on(event: string, handler: Function) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event)!.push(handler);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      const handlers = this.listeners.get(event) || [];
      handlers.forEach(h => h(...args));
    }

    async connect() {
      this.state = ConnectionState.Connected;
    }
    async startAudio() {}
    async disconnect() {
      this.state = ConnectionState.Disconnected;
    }
  }

  const Room = MockRoom;
  class RemoteParticipant {}
  class RemoteTrack {}
  class RemoteTrackPublication {}

  return { Room, RoomEvent, ConnectionState, Track, RemoteParticipant, RemoteTrack, RemoteTrackPublication };
});

import { ClassroomLiveKit } from './classroomLiveKit';

describe('ClassroomLiveKit', () => {
  let classroom: ClassroomLiveKit;

  beforeEach(() => {
    classroom = new ClassroomLiveKit();
  });

  // === 接続 ===
  describe('connect / disconnect', () => {
    it('connectでConnected状態になる', async () => {
      await classroom.connect('wss://example.com', 'token');
      expect(classroom.isConnected).toBe(true);
      expect(classroom.connectionState).toBe('connected');
    });

    it('disconnectでDisconnected状態になる', async () => {
      await classroom.connect('wss://example.com', 'token');
      await classroom.disconnect();
      expect(classroom.isConnected).toBe(false);
    });
  });

  // === localIdentity ===
  describe('localIdentity', () => {
    it('ローカル参加者のidentityを返す', () => {
      expect(classroom.localIdentity).toBe('三村先生');
    });
  });

  // === participants ===
  describe('participants', () => {
    it('ローカル参加者が含まれる', () => {
      const list = classroom.participants;
      expect(list).toHaveLength(1);
      expect(list[0].identity).toBe('三村先生');
    });

    it('リモート参加者も含まれる', () => {
      (classroom.room.remoteParticipants as Map<string, unknown>).set('student-1', {
        identity: 'たろう',
        isSpeaking: true,
        isMicrophoneEnabled: true,
        isCameraEnabled: false,
      });

      const list = classroom.participants;
      expect(list).toHaveLength(2);
      expect(list[1].identity).toBe('たろう');
      expect(list[1].isSpeaking).toBe(true);
    });
  });

  // === remoteIdentities ===
  describe('remoteIdentities', () => {
    it('リモート参加者のidentity一覧を返す', () => {
      (classroom.room.remoteParticipants as Map<string, unknown>).set('s1', { identity: 'たろう' });
      (classroom.room.remoteParticipants as Map<string, unknown>).set('s2', { identity: 'はなこ' });

      expect(classroom.remoteIdentities).toEqual(['たろう', 'はなこ']);
    });

    it('リモートがいない場合は空配列', () => {
      expect(classroom.remoteIdentities).toEqual([]);
    });
  });

  // === broadcast ===
  describe('broadcast', () => {
    it('信頼性が必要なメッセージはreliable: trueで送信', async () => {
      const publishData = classroom.room.localParticipant.publishData;

      await classroom.broadcast({ type: 'BOARD_UPDATE', payload: {} });

      expect(publishData).toHaveBeenCalled();
      const [, opts] = publishData.mock.calls[0];
      expect(opts.reliable).toBe(true);
      expect(opts.topic).toBe('BOARD_UPDATE');
    });

    it('カーソル移動はreliable: falseで送信', async () => {
      const publishData = classroom.room.localParticipant.publishData;

      await classroom.broadcast({ type: 'CURSOR_MOVE', payload: { x: 3, y: 3, identity: '先生' } });

      expect(publishData).toHaveBeenCalled();
      const [, opts] = publishData.mock.calls[0];
      expect(opts.reliable).toBe(false);
      expect(opts.topic).toBe('CURSOR_MOVE');
    });

    it('メッセージがJSON形式でエンコードされる', async () => {
      const publishData = classroom.room.localParticipant.publishData;

      await classroom.broadcast({ type: 'BOARD_UPDATE', payload: { test: 123 } });

      const sentData = publishData.mock.calls[0][0];
      const decoded = JSON.parse(new TextDecoder().decode(sentData));
      expect(decoded).toEqual({ type: 'BOARD_UPDATE', payload: { test: 123 } });
    });
  });

  // === sendTo ===
  describe('sendTo', () => {
    it('指定した参加者にメッセージを送信', async () => {
      (classroom.room.remoteParticipants as Map<string, unknown>).set('s1', { identity: 'たろう' });
      const publishData = classroom.room.localParticipant.publishData;

      await classroom.sendTo(
        { type: 'GAME_LIST_SYNC', payload: { games: [] } },
        ['たろう']
      );

      expect(publishData).toHaveBeenCalled();
      const [, opts] = publishData.mock.calls[0];
      expect(opts.reliable).toBe(true);
      expect(opts.destinationIdentities).toEqual(['たろう']);
    });

    it('該当する参加者がいない場合は送信しない', async () => {
      const publishData = classroom.room.localParticipant.publishData;

      await classroom.sendTo(
        { type: 'GAME_LIST_SYNC', payload: { games: [] } },
        ['存在しない人']
      );

      expect(publishData).not.toHaveBeenCalled();
    });
  });

  // === イベントハンドラ ===
  describe('event handlers', () => {
    it('DataReceivedでonMessageが呼ばれる', () => {
      const onMessage = vi.fn();
      classroom.setHandlers({ onMessage });

      const msg = { type: 'BOARD_UPDATE', payload: {} };
      const encoded = new TextEncoder().encode(JSON.stringify(msg));
      const mockParticipant = { identity: 'たろう' };

      (classroom.room as unknown as { emit: Function }).emit('dataReceived', encoded, mockParticipant);

      expect(onMessage).toHaveBeenCalledWith(msg, 'たろう');
    });

    it('不正なデータは無視される', () => {
      const onMessage = vi.fn();
      classroom.setHandlers({ onMessage });

      const badData = new TextEncoder().encode('not json');
      (classroom.room as unknown as { emit: Function }).emit('dataReceived', badData, undefined);

      expect(onMessage).not.toHaveBeenCalled();
    });

    it('ParticipantConnectedでonParticipantJoinedが呼ばれる', () => {
      const onParticipantJoined = vi.fn();
      classroom.setHandlers({ onParticipantJoined });

      (classroom.room as unknown as { emit: Function }).emit(
        'participantConnected',
        { identity: 'はなこ' }
      );

      expect(onParticipantJoined).toHaveBeenCalledWith('はなこ');
    });

    it('ParticipantDisconnectedでonParticipantLeftが呼ばれる', () => {
      const onParticipantLeft = vi.fn();
      classroom.setHandlers({ onParticipantLeft });

      (classroom.room as unknown as { emit: Function }).emit(
        'participantDisconnected',
        { identity: 'たろう' }
      );

      expect(onParticipantLeft).toHaveBeenCalledWith('たろう');
    });

    it('ConnectionStateChangedでonConnectionStateChangedが呼ばれる', () => {
      const onConnectionStateChanged = vi.fn();
      classroom.setHandlers({ onConnectionStateChanged });

      (classroom.room as unknown as { emit: Function }).emit(
        'connectionStateChanged',
        'connected'
      );

      expect(onConnectionStateChanged).toHaveBeenCalledWith('connected');
    });

    it('ActiveSpeakersChangedでidentity配列が渡される', () => {
      const onActiveSpeakersChanged = vi.fn();
      classroom.setHandlers({ onActiveSpeakersChanged });

      (classroom.room as unknown as { emit: Function }).emit(
        'activeSpeakersChanged',
        [{ identity: 'たろう' }, { identity: 'はなこ' }]
      );

      expect(onActiveSpeakersChanged).toHaveBeenCalledWith(['たろう', 'はなこ']);
    });
  });

  // === マイク・カメラ ===
  describe('microphone / camera', () => {
    it('toggleMicrophoneでマイクを切り替え', async () => {
      const setMic = classroom.room.localParticipant.setMicrophoneEnabled;
      const result = await classroom.toggleMicrophone();
      expect(setMic).toHaveBeenCalledWith(true);
      expect(result).toBe(true);
    });

    it('toggleCameraでカメラを切り替え', async () => {
      const setCam = classroom.room.localParticipant.setCameraEnabled;
      const result = await classroom.toggleCamera();
      expect(setCam).toHaveBeenCalledWith(true);
      expect(result).toBe(true);
    });

    it('enableMicrophone / disableMicrophone', async () => {
      const setMic = classroom.room.localParticipant.setMicrophoneEnabled;
      await classroom.enableMicrophone();
      expect(setMic).toHaveBeenCalledWith(true);
      await classroom.disableMicrophone();
      expect(setMic).toHaveBeenCalledWith(false);
    });

    it('isMicrophoneEnabled / isCameraEnabled', () => {
      expect(classroom.isMicrophoneEnabled).toBe(false);
      expect(classroom.isCameraEnabled).toBe(false);
    });
  });

  // === destroy ===
  describe('destroy', () => {
    it('disconnectが呼ばれる', () => {
      const spy = vi.spyOn(classroom.room, 'disconnect');
      classroom.destroy();
      expect(spy).toHaveBeenCalled();
    });
  });
});
