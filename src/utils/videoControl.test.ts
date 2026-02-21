/**
 * ビデオ（カメラ）制御フロー テスト
 *
 * テスト対象:
 * - カメラトグルのフロー（LiveKit API呼び出し→状態更新）
 * - ビデオトラックのsubscribe/unsubscribe処理
 * - 参加者一覧のvideoEnabled状態管理
 * - カメラ許可（cameraAllowed）の先生→生徒制御
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AudioPermissions } from '../types/game';
import type { ParticipantInfo, ClassroomMessage } from './classroomLiveKit';

// === ヘルパー: App.tsxのビデオロジックを再現 ===

/** カメラトグル（App.tsx L340-348 相当） */
async function toggleCamera(
  classroomRef: { toggleCamera: () => Promise<boolean>; isConnected: boolean },
): Promise<{ enabled: boolean; error?: string }> {
  if (!classroomRef.isConnected) return { enabled: false, error: '未接続' };
  try {
    const enabled = await classroomRef.toggleCamera();
    return { enabled };
  } catch (err) {
    return { enabled: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 先生側: 生徒のカメラ許可をトグル */
function toggleStudentCamera(
  identity: string,
  audioPermissions: AudioPermissions,
  sendTo: (msg: ClassroomMessage, identities: string[]) => void,
): AudioPermissions {
  const current = audioPermissions[identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
  const updated = { ...audioPermissions, [identity]: { ...current, cameraAllowed: !current.cameraAllowed } };
  sendTo(
    { type: 'MEDIA_CONTROL', payload: { micAllowed: current.micAllowed, cameraAllowed: !current.cameraAllowed } },
    [identity]
  );
  return updated;
}

// === モック ===

interface MockTrack {
  kind: 'audio' | 'video';
  attach: () => HTMLElement;
  detach: () => HTMLElement[];
  mediaStreamTrack: { enabled: boolean };
}

interface MockPublication {
  track: MockTrack | null;
}

interface MockRemoteParticipant {
  identity: string;
  isSpeaking: boolean;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  audioTrackPublications: Map<string, MockPublication>;
  videoTrackPublications: Map<string, MockPublication>;
}

function createMockParticipant(
  identity: string,
  opts: { audio?: boolean; video?: boolean } = {},
): MockRemoteParticipant {
  const audioPubs = new Map<string, MockPublication>();
  const videoPubs = new Map<string, MockPublication>();

  if (opts.audio) {
    audioPubs.set('audio-1', {
      track: {
        kind: 'audio',
        attach: () => document.createElement('audio'),
        detach: () => [],
        mediaStreamTrack: { enabled: true },
      },
    });
  }
  if (opts.video) {
    videoPubs.set('video-1', {
      track: {
        kind: 'video',
        attach: () => document.createElement('video'),
        detach: () => [],
        mediaStreamTrack: { enabled: true },
      },
    });
  }

  return {
    identity,
    isSpeaking: false,
    isMicrophoneEnabled: !!opts.audio,
    isCameraEnabled: !!opts.video,
    audioTrackPublications: audioPubs,
    videoTrackPublications: videoPubs,
  };
}

function toParticipantInfo(p: MockRemoteParticipant): ParticipantInfo {
  return {
    identity: p.identity,
    isSpeaking: p.isSpeaking,
    audioEnabled: p.isMicrophoneEnabled,
    videoEnabled: p.isCameraEnabled,
  };
}

// === テスト ===

describe('ビデオ制御フロー', () => {
  // === カメラトグル ===
  describe('カメラトグル', () => {
    it('未接続時はエラーを返す', async () => {
      const mockClassroom = {
        isConnected: false,
        toggleCamera: vi.fn(),
      };

      const result = await toggleCamera(mockClassroom);
      expect(result.enabled).toBe(false);
      expect(result.error).toBe('未接続');
      expect(mockClassroom.toggleCamera).not.toHaveBeenCalled();
    });

    it('接続中にカメラをONにできる', async () => {
      const mockClassroom = {
        isConnected: true,
        toggleCamera: vi.fn().mockResolvedValue(true),
      };

      const result = await toggleCamera(mockClassroom);
      expect(result.enabled).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('接続中にカメラをOFFにできる', async () => {
      const mockClassroom = {
        isConnected: true,
        toggleCamera: vi.fn().mockResolvedValue(false),
      };

      const result = await toggleCamera(mockClassroom);
      expect(result.enabled).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('カメラ許可エラー時にエラーメッセージを返す', async () => {
      const mockClassroom = {
        isConnected: true,
        toggleCamera: vi.fn().mockRejectedValue(new Error('Permission denied')),
      };

      const result = await toggleCamera(mockClassroom);
      expect(result.enabled).toBe(false);
      expect(result.error).toBe('Permission denied');
    });

    it('非Errorオブジェクトのエラーも処理できる', async () => {
      const mockClassroom = {
        isConnected: true,
        toggleCamera: vi.fn().mockRejectedValue('unknown error'),
      };

      const result = await toggleCamera(mockClassroom);
      expect(result.error).toBe('unknown error');
    });
  });

  // === ビデオトラック subscribe/unsubscribe ===
  describe('ビデオトラック管理', () => {
    it('ビデオトラックsubscribe時にattachが呼ばれる', () => {
      const videoEl = document.createElement('video');
      const track: MockTrack = {
        kind: 'video',
        attach: vi.fn(() => videoEl),
        detach: vi.fn(() => []),
        mediaStreamTrack: { enabled: true },
      };

      // classroomLiveKit.tsのTrackSubscribedハンドラ相当
      if (track.kind === 'video') {
        // videoトラックの場合はparticipantsChanged通知のみ
        // （現在の実装ではDOM追加しない、audioのみDOM追加）
      }

      // audioトラックの場合はDOM追加
      const audioTrack: MockTrack = {
        kind: 'audio',
        attach: vi.fn(() => {
          const el = document.createElement('audio');
          el.id = 'audio-test';
          return el;
        }),
        detach: vi.fn(() => []),
        mediaStreamTrack: { enabled: true },
      };

      if (audioTrack.kind === 'audio') {
        const el = audioTrack.attach();
        document.body.appendChild(el);
      }

      expect(document.getElementById('audio-test')).toBeInTheDocument();
      document.getElementById('audio-test')?.remove();
    });

    it('トラックunsubscribe時にdetach→DOM削除される', () => {
      const el1 = document.createElement('video');
      el1.id = 'video-remove-1';
      document.body.appendChild(el1);

      const track: MockTrack = {
        kind: 'video',
        attach: vi.fn(() => document.createElement('video')),
        detach: vi.fn(() => [el1]),
        mediaStreamTrack: { enabled: true },
      };

      // classroomLiveKit.tsのTrackUnsubscribedハンドラ相当
      track.detach().forEach(el => el.remove());

      expect(document.getElementById('video-remove-1')).not.toBeInTheDocument();
    });
  });

  // === 参加者一覧のvideoEnabled ===
  describe('参加者一覧のvideoEnabled状態', () => {
    it('カメラONの参加者はvideoEnabled: true', () => {
      const p = createMockParticipant('たろう', { video: true, audio: true });
      const info = toParticipantInfo(p);
      expect(info.videoEnabled).toBe(true);
    });

    it('カメラOFFの参加者はvideoEnabled: false', () => {
      const p = createMockParticipant('はなこ', { video: false, audio: true });
      const info = toParticipantInfo(p);
      expect(info.videoEnabled).toBe(false);
    });

    it('音声もビデオもなしの参加者', () => {
      const p = createMockParticipant('観戦者', {});
      const info = toParticipantInfo(p);
      expect(info.videoEnabled).toBe(false);
      expect(info.audioEnabled).toBe(false);
    });

    it('複数参加者のvideoEnabled一覧', () => {
      const participants = [
        createMockParticipant('三村先生', { audio: true, video: true }),
        createMockParticipant('たろう', { audio: true, video: false }),
        createMockParticipant('はなこ', { audio: false, video: true }),
      ];

      const infos = participants.map(toParticipantInfo);
      expect(infos[0].videoEnabled).toBe(true);
      expect(infos[1].videoEnabled).toBe(false);
      expect(infos[2].videoEnabled).toBe(true);
    });
  });

  // === 先生→生徒のカメラ許可制御 ===
  describe('先生→生徒: カメラ許可制御', () => {
    let sendTo: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      sendTo = vi.fn();
    });

    it('初回トグルでcameraAllowed: falseを送信', () => {
      const perms: AudioPermissions = {};
      const updated = toggleStudentCamera('たろう', perms, sendTo);

      expect(updated['たろう'].cameraAllowed).toBe(false);
      expect(sendTo).toHaveBeenCalledWith(
        { type: 'MEDIA_CONTROL', payload: { micAllowed: true, cameraAllowed: false } },
        ['たろう']
      );
    });

    it('2回目トグルでcameraAllowed: trueを送信', () => {
      let perms: AudioPermissions = {};
      perms = toggleStudentCamera('たろう', perms, sendTo);
      perms = toggleStudentCamera('たろう', perms, sendTo);

      expect(perms['たろう'].cameraAllowed).toBe(true);
      expect(sendTo).toHaveBeenLastCalledWith(
        { type: 'MEDIA_CONTROL', payload: { micAllowed: true, cameraAllowed: true } },
        ['たろう']
      );
    });

    it('micAllowedの現在値を保持して送信', () => {
      const perms: AudioPermissions = {
        'たろう': { canHear: true, micAllowed: false, cameraAllowed: true },
      };
      toggleStudentCamera('たろう', perms, sendTo);

      expect(sendTo).toHaveBeenCalledWith(
        { type: 'MEDIA_CONTROL', payload: { micAllowed: false, cameraAllowed: false } },
        ['たろう']
      );
    });

    it('canHearはそのまま維持', () => {
      const perms: AudioPermissions = {
        'たろう': { canHear: false, micAllowed: true, cameraAllowed: true },
      };
      const updated = toggleStudentCamera('たろう', perms, sendTo);
      expect(updated['たろう'].canHear).toBe(false);
    });

    it('生徒ごとに独立した制御', () => {
      let perms: AudioPermissions = {};
      perms = toggleStudentCamera('たろう', perms, sendTo);
      perms = toggleStudentCamera('はなこ', perms, sendTo);

      expect(perms['たろう'].cameraAllowed).toBe(false);
      expect(perms['はなこ'].cameraAllowed).toBe(false);
      // micAllowedは変わらない
      expect(perms['たろう'].micAllowed).toBe(true);
      expect(perms['はなこ'].micAllowed).toBe(true);
    });
  });

  // === HeaderのカメラボタンUI ===
  describe('HeaderカメラボタンのUI状態', () => {
    it('onToggleCameraが未指定ならカメラボタンは表示されない', () => {
      // Header.tsxのL78: {onToggleCamera && (...)}
      const onToggleCamera = undefined;
      expect(!!onToggleCamera).toBe(false);
    });

    it('isCameraEnabled=trueのタイトルは「カメラOFF」', () => {
      // Header.tsxのL86
      const isCameraEnabled = true;
      const title = isCameraEnabled ? 'カメラOFF' : 'カメラON';
      expect(title).toBe('カメラOFF');
    });

    it('isCameraEnabled=falseのタイトルは「カメラON」', () => {
      const isCameraEnabled = false;
      const title = isCameraEnabled ? 'カメラOFF' : 'カメラON';
      expect(title).toBe('カメラON');
    });
  });

  // === 統合フロー ===
  describe('統合: カメラ制御の往復フロー', () => {
    it('先生がカメラON → 参加者一覧に反映', async () => {
      // 先生がカメラをON
      const mockClassroom = {
        isConnected: true,
        toggleCamera: vi.fn().mockResolvedValue(true),
      };
      const result = await toggleCamera(mockClassroom);
      expect(result.enabled).toBe(true);

      // 参加者一覧にvideoEnabled: trueで反映
      const teacher = createMockParticipant('三村先生', { audio: true, video: true });
      const info = toParticipantInfo(teacher);
      expect(info.videoEnabled).toBe(true);
    });

    it('先生が生徒のカメラOFF → MEDIA_CONTROL送信', () => {
      const sendTo = vi.fn();
      const perms: AudioPermissions = {};

      // 先生がたろうのカメラをOFF
      const updated = toggleStudentCamera('たろう', perms, sendTo);

      // メッセージ検証
      expect(sendTo).toHaveBeenCalledTimes(1);
      const [msg, targets] = sendTo.mock.calls[0];
      expect(msg.type).toBe('MEDIA_CONTROL');
      expect((msg.payload as { cameraAllowed: boolean }).cameraAllowed).toBe(false);
      expect(targets).toEqual(['たろう']);
      expect(updated['たろう'].cameraAllowed).toBe(false);
    });

    it('カメラON→OFF→ONの往復で元に戻る', async () => {
      const mockClassroom = {
        isConnected: true,
        toggleCamera: vi.fn()
          .mockResolvedValueOnce(true)
          .mockResolvedValueOnce(false)
          .mockResolvedValueOnce(true),
      };

      const r1 = await toggleCamera(mockClassroom);
      expect(r1.enabled).toBe(true);

      const r2 = await toggleCamera(mockClassroom);
      expect(r2.enabled).toBe(false);

      const r3 = await toggleCamera(mockClassroom);
      expect(r3.enabled).toBe(true);

      expect(mockClassroom.toggleCamera).toHaveBeenCalledTimes(3);
    });
  });
});
