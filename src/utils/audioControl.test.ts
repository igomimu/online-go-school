/**
 * 音声制御フロー テスト
 *
 * App.tsxに実装されている音声制御ロジックのフローを
 * モック環境で再現し、メッセージの送受信と状態変化を検証する。
 *
 * テスト対象:
 * - 先生→生徒: 音声配信ON/OFF (AUDIO_CONTROL)
 * - 先生→生徒: マイク許可ON/OFF (MEDIA_CONTROL)
 * - 生徒側: AUDIO_CONTROLの受信→トラック有効/無効化
 * - 生徒側: MEDIA_CONTROLの受信→マイク強制OFF
 * - マイクトグル、ミュート制御
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AudioPermissions } from '../types/game';
import type { ClassroomMessage } from './classroomLiveKit';

// === ヘルパー: App.tsxの音声ロジックを再現 ===

/** 先生側: 生徒の音声配信をトグルする（App.tsx L477-487 相当） */
function toggleHear(
  identity: string,
  audioPermissions: AudioPermissions,
  sendTo: (msg: ClassroomMessage, identities: string[]) => void,
): AudioPermissions {
  const current = audioPermissions[identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
  const updated = { ...audioPermissions, [identity]: { ...current, canHear: !current.canHear } };
  sendTo(
    { type: 'AUDIO_CONTROL', payload: { canHear: !current.canHear } },
    [identity]
  );
  return updated;
}

/** 先生側: 生徒のマイクをトグルする（App.tsx L489-499 相当） */
function toggleStudentMic(
  identity: string,
  audioPermissions: AudioPermissions,
  sendTo: (msg: ClassroomMessage, identities: string[]) => void,
): AudioPermissions {
  const current = audioPermissions[identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
  const updated = { ...audioPermissions, [identity]: { ...current, micAllowed: !current.micAllowed } };
  sendTo(
    { type: 'MEDIA_CONTROL', payload: { micAllowed: !current.micAllowed, cameraAllowed: current.cameraAllowed } },
    [identity]
  );
  return updated;
}

/** 生徒側: AUDIO_CONTROLメッセージを処理（App.tsx L183-199 相当） */
function handleAudioControl(
  payload: { canHear: boolean },
  remoteParticipants: Map<string, MockRemoteParticipant>,
) {
  remoteParticipants.forEach(rp => {
    rp.audioTrackPublications.forEach(pub => {
      if (pub.track) pub.track.mediaStreamTrack.enabled = payload.canHear;
    });
  });
}

/** 生徒側: MEDIA_CONTROLメッセージを処理（App.tsx L202-208 相当） */
function handleMediaControl(
  payload: { micAllowed: boolean; cameraAllowed: boolean },
  isMicEnabled: boolean,
  disableMicrophone: () => void,
): boolean {
  if (!payload.micAllowed && isMicEnabled) {
    disableMicrophone();
    return false; // マイクOFF
  }
  return isMicEnabled;
}

// === モック ===

interface MockTrack {
  mediaStreamTrack: { enabled: boolean };
}

interface MockPublication {
  track: MockTrack | null;
}

interface MockRemoteParticipant {
  identity: string;
  audioTrackPublications: Map<string, MockPublication>;
}

function createMockRemoteParticipant(identity: string, hasAudio: boolean): MockRemoteParticipant {
  const pubs = new Map<string, MockPublication>();
  if (hasAudio) {
    pubs.set('audio-1', {
      track: { mediaStreamTrack: { enabled: true } },
    });
  }
  return { identity, audioTrackPublications: pubs };
}

// === テスト ===

describe('音声制御フロー', () => {
  let sendTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendTo = vi.fn();
  });

  // === 先生側: 音声配信制御 ===
  describe('先生→生徒: 音声配信制御 (AUDIO_CONTROL)', () => {
    it('初回トグルでcanHear: falseを送信（デフォルトtrue→false）', () => {
      const perms: AudioPermissions = {};
      const updated = toggleHear('たろう', perms, sendTo);

      expect(updated['たろう'].canHear).toBe(false);
      expect(sendTo).toHaveBeenCalledWith(
        { type: 'AUDIO_CONTROL', payload: { canHear: false } },
        ['たろう']
      );
    });

    it('2回目トグルでcanHear: trueを送信（false→true）', () => {
      let perms: AudioPermissions = {};
      perms = toggleHear('たろう', perms, sendTo);
      perms = toggleHear('たろう', perms, sendTo);

      expect(perms['たろう'].canHear).toBe(true);
      expect(sendTo).toHaveBeenLastCalledWith(
        { type: 'AUDIO_CONTROL', payload: { canHear: true } },
        ['たろう']
      );
    });

    it('生徒ごとに独立した制御', () => {
      let perms: AudioPermissions = {};
      perms = toggleHear('たろう', perms, sendTo);
      perms = toggleHear('はなこ', perms, sendTo);

      expect(perms['たろう'].canHear).toBe(false);
      expect(perms['はなこ'].canHear).toBe(false);
      expect(sendTo).toHaveBeenCalledTimes(2);
    });

    it('他の権限（micAllowed, cameraAllowed）はそのまま維持', () => {
      const perms: AudioPermissions = {
        'たろう': { canHear: true, micAllowed: false, cameraAllowed: false },
      };
      const updated = toggleHear('たろう', perms, sendTo);

      expect(updated['たろう'].micAllowed).toBe(false);
      expect(updated['たろう'].cameraAllowed).toBe(false);
    });
  });

  // === 先生側: マイク制御 ===
  describe('先生→生徒: マイク制御 (MEDIA_CONTROL)', () => {
    it('初回トグルでmicAllowed: falseを送信', () => {
      const perms: AudioPermissions = {};
      const updated = toggleStudentMic('たろう', perms, sendTo);

      expect(updated['たろう'].micAllowed).toBe(false);
      expect(sendTo).toHaveBeenCalledWith(
        { type: 'MEDIA_CONTROL', payload: { micAllowed: false, cameraAllowed: true } },
        ['たろう']
      );
    });

    it('2回目トグルでmicAllowed: trueを送信', () => {
      let perms: AudioPermissions = {};
      perms = toggleStudentMic('たろう', perms, sendTo);
      perms = toggleStudentMic('たろう', perms, sendTo);

      expect(perms['たろう'].micAllowed).toBe(true);
      expect(sendTo).toHaveBeenLastCalledWith(
        { type: 'MEDIA_CONTROL', payload: { micAllowed: true, cameraAllowed: true } },
        ['たろう']
      );
    });

    it('cameraAllowedの現在値を保持して送信', () => {
      const perms: AudioPermissions = {
        'たろう': { canHear: true, micAllowed: true, cameraAllowed: false },
      };
      toggleStudentMic('たろう', perms, sendTo);

      expect(sendTo).toHaveBeenCalledWith(
        { type: 'MEDIA_CONTROL', payload: { micAllowed: false, cameraAllowed: false } },
        ['たろう']
      );
    });

    it('canHearはそのまま維持', () => {
      const perms: AudioPermissions = {
        'たろう': { canHear: false, micAllowed: true, cameraAllowed: true },
      };
      const updated = toggleStudentMic('たろう', perms, sendTo);

      expect(updated['たろう'].canHear).toBe(false);
    });
  });

  // === 生徒側: 音声制御受信 ===
  describe('生徒側: AUDIO_CONTROL受信', () => {
    it('canHear: falseでリモート音声トラックが無効になる', () => {
      const remotes = new Map<string, MockRemoteParticipant>();
      remotes.set('teacher', createMockRemoteParticipant('三村先生', true));

      handleAudioControl({ canHear: false }, remotes);

      const track = remotes.get('teacher')!.audioTrackPublications.get('audio-1')!.track!;
      expect(track.mediaStreamTrack.enabled).toBe(false);
    });

    it('canHear: trueでリモート音声トラックが有効になる', () => {
      const remotes = new Map<string, MockRemoteParticipant>();
      const participant = createMockRemoteParticipant('三村先生', true);
      // まず無効にする
      participant.audioTrackPublications.get('audio-1')!.track!.mediaStreamTrack.enabled = false;
      remotes.set('teacher', participant);

      handleAudioControl({ canHear: true }, remotes);

      const track = remotes.get('teacher')!.audioTrackPublications.get('audio-1')!.track!;
      expect(track.mediaStreamTrack.enabled).toBe(true);
    });

    it('複数のリモート参加者全員に適用される', () => {
      const remotes = new Map<string, MockRemoteParticipant>();
      remotes.set('t1', createMockRemoteParticipant('三村先生', true));
      remotes.set('s1', createMockRemoteParticipant('はなこ', true));

      handleAudioControl({ canHear: false }, remotes);

      remotes.forEach(rp => {
        rp.audioTrackPublications.forEach(pub => {
          expect(pub.track!.mediaStreamTrack.enabled).toBe(false);
        });
      });
    });

    it('音声トラックがないリモート参加者はスキップ', () => {
      const remotes = new Map<string, MockRemoteParticipant>();
      remotes.set('s1', createMockRemoteParticipant('たろう', false));

      // エラーが出ないこと
      expect(() => handleAudioControl({ canHear: false }, remotes)).not.toThrow();
    });

    it('trackがnullのpublicationはスキップ', () => {
      const remotes = new Map<string, MockRemoteParticipant>();
      const participant: MockRemoteParticipant = {
        identity: '三村先生',
        audioTrackPublications: new Map([['audio-1', { track: null }]]),
      };
      remotes.set('teacher', participant);

      expect(() => handleAudioControl({ canHear: false }, remotes)).not.toThrow();
    });
  });

  // === 生徒側: メディア制御受信 ===
  describe('生徒側: MEDIA_CONTROL受信', () => {
    it('micAllowed: falseでマイクON中→マイクが無効化される', () => {
      const disableMic = vi.fn();
      const result = handleMediaControl(
        { micAllowed: false, cameraAllowed: true },
        true, // マイクON中
        disableMic,
      );

      expect(disableMic).toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('micAllowed: falseでマイクOFF中→何もしない', () => {
      const disableMic = vi.fn();
      const result = handleMediaControl(
        { micAllowed: false, cameraAllowed: true },
        false, // マイクすでにOFF
        disableMic,
      );

      expect(disableMic).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });

    it('micAllowed: trueの場合→マイク状態は変わらない（許可のみ）', () => {
      const disableMic = vi.fn();
      const result = handleMediaControl(
        { micAllowed: true, cameraAllowed: true },
        true,
        disableMic,
      );

      expect(disableMic).not.toHaveBeenCalled();
      expect(result).toBe(true);
    });
  });

  // === 統合フロー ===
  describe('統合: 先生→生徒の音声制御往復', () => {
    it('先生が音声配信OFFにする→生徒のトラックが無効になる', () => {
      // 1. 先生側でトグル
      const perms: AudioPermissions = {};
      toggleHear('たろう', perms, sendTo);

      // 2. 送信されたメッセージを取得
      const [msg] = sendTo.mock.calls[0];
      expect(msg.type).toBe('AUDIO_CONTROL');
      expect(msg.payload).toEqual({ canHear: false });

      // 3. 生徒側でメッセージを処理
      const remotes = new Map<string, MockRemoteParticipant>();
      remotes.set('teacher', createMockRemoteParticipant('三村先生', true));
      handleAudioControl(msg.payload as { canHear: boolean }, remotes);

      // 4. 検証
      const track = remotes.get('teacher')!.audioTrackPublications.get('audio-1')!.track!;
      expect(track.mediaStreamTrack.enabled).toBe(false);
    });

    it('先生がマイクOFFにする→生徒のマイクが無効になる', () => {
      // 1. 先生側でトグル
      const perms: AudioPermissions = {};
      toggleStudentMic('たろう', perms, sendTo);

      // 2. 送信されたメッセージを取得
      const [msg] = sendTo.mock.calls[0];
      expect(msg.type).toBe('MEDIA_CONTROL');
      expect(msg.payload).toEqual({ micAllowed: false, cameraAllowed: true });

      // 3. 生徒側でメッセージを処理
      const disableMic = vi.fn();
      const newMicState = handleMediaControl(
        msg.payload as { micAllowed: boolean; cameraAllowed: boolean },
        true,
        disableMic,
      );

      // 4. 検証
      expect(disableMic).toHaveBeenCalled();
      expect(newMicState).toBe(false);
    });

    it('先生が音声ON→OFF→ONの往復で元に戻る', () => {
      const remotes = new Map<string, MockRemoteParticipant>();
      remotes.set('teacher', createMockRemoteParticipant('三村先生', true));

      // OFF
      let perms: AudioPermissions = {};
      perms = toggleHear('たろう', perms, sendTo);
      handleAudioControl(
        sendTo.mock.calls[0][0].payload as { canHear: boolean },
        remotes,
      );
      expect(remotes.get('teacher')!.audioTrackPublications.get('audio-1')!.track!.mediaStreamTrack.enabled).toBe(false);

      // ON
      perms = toggleHear('たろう', perms, sendTo);
      handleAudioControl(
        sendTo.mock.calls[1][0].payload as { canHear: boolean },
        remotes,
      );
      expect(remotes.get('teacher')!.audioTrackPublications.get('audio-1')!.track!.mediaStreamTrack.enabled).toBe(true);
    });
  });
});
