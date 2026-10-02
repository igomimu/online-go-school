import {
  getExcludedMics,
  isTrackOnExcludedMic,
  NO_ALLOWED_MIC_MESSAGE,
  resolveMic,
} from './mediaDevices';

/** 除外リストを守らせる相手（LiveKit / RealtimeKit の両実装） */
export interface MicGuardTarget {
  readonly isMicrophoneEnabled: boolean;
  getLocalAudioTrack(): MediaStreamTrack | undefined;
  switchDevice(kind: 'audioinput', deviceId: string): Promise<void>;
  disableMicrophone(): Promise<void>;
}

/**
 * マイクを点ける前に、除外していない機器へ固定する。
 * 1台も無ければ点けない（ブラウザが除外した機器を掴むのを先回りで止める）。
 * 除外が無いときは何もしない＝これまでどおり。
 */
export async function prepareMic(select: (deviceId: string) => Promise<void>): Promise<void> {
  if (getExcludedMics().length === 0) return;
  const choice = await resolveMic();
  if (choice.kind === 'none') throw new Error(NO_ALLOWED_MIC_MESSAGE);
  if (choice.kind === 'device') await select(choice.deviceId);
}

/**
 * 点いているマイクが除外した機器なら、除外していない機器へ切り替える。
 * 切り替え先が無ければマイクを切る。
 * 点けた直後（許可前は機器名が取れず事前に決められない）と、機器の抜き差しのたびに呼ぶ。
 */
export async function enforceMic(target: MicGuardTarget): Promise<'ok' | 'switched' | 'blocked'> {
  if (!target.isMicrophoneEnabled) return 'ok';
  if (!(await isTrackOnExcludedMic(target.getLocalAudioTrack()))) return 'ok';
  const choice = await resolveMic();
  if (choice.kind === 'device') {
    try {
      await target.switchDevice('audioinput', choice.deviceId);
      if (!(await isTrackOnExcludedMic(target.getLocalAudioTrack()))) return 'switched';
    } catch (err) {
      console.warn('[media] 除外していないマイクへ切り替えられませんでした', err);
    }
  }
  await target.disableMicrophone();
  return 'blocked';
}

/**
 * 機器の抜き差しを見張る。OS の既定が除外した機器へ移ると SDK が追いかけることがあるので、
 * 落ち着くのを少し待ってから確かめる。戻り値で見張りをやめる。
 */
export function watchMicDevices(check: () => void, delayMs = 800): () => void {
  const media = navigator.mediaDevices;
  if (!media?.addEventListener) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(check, delayMs);
  };
  media.addEventListener('devicechange', onChange);
  return () => {
    clearTimeout(timer);
    media.removeEventListener('devicechange', onChange);
  };
}
