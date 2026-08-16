export type MediaIntentRole = 'TEACHER' | 'STUDENT';

export interface MediaIntent {
  mic: boolean;
  camera: boolean;
}

export interface MediaIntentController {
  readonly isMicrophoneEnabled: boolean;
  readonly isCameraEnabled: boolean;
  enableMicrophone: () => Promise<void>;
  disableMicrophone: () => Promise<void>;
  enableCamera: () => Promise<void>;
  disableCamera: () => Promise<void>;
}

const DEFAULT_MEDIA_INTENT: MediaIntent = { mic: false, camera: false };

/**
 * scope は「誰の設定か」。道場の共有PCでは同じ端末を生徒が代わる代わる使うので、
 * 生徒は生徒IDごとに分けて持つ。渡さなければ役割ごとの1つ（講師用）になる。
 */
function storageKey(role: MediaIntentRole, scope?: string): string {
  const base = `go-school-media-intent-${role.toLowerCase()}`;
  return scope ? `${base}-${scope}` : base;
}

/**
 * 最後に本人が使っていたマイク・カメラ状態。
 * LiveKitのトラック状態とは分けて保存し、再入室・Room再作成・ページ再読込の後に復元する。
 */
export function loadMediaIntent(role: MediaIntentRole, scope?: string): MediaIntent {
  try {
    const raw = localStorage.getItem(storageKey(role, scope));
    if (!raw) return { ...DEFAULT_MEDIA_INTENT };
    const parsed = JSON.parse(raw) as Partial<MediaIntent>;
    return {
      mic: parsed.mic === true,
      camera: parsed.camera === true,
    };
  } catch {
    return { ...DEFAULT_MEDIA_INTENT };
  }
}

export function saveMediaIntent(role: MediaIntentRole, intent: MediaIntent, scope?: string): void {
  try {
    localStorage.setItem(storageKey(role, scope), JSON.stringify(intent));
  } catch {
    // 保存できなくても現在の通話操作は続けられる。
  }
}

/** 一方の機器が失敗しても、もう一方の復元は続ける。 */
export async function applyMediaIntent(
  controller: MediaIntentController,
  intent: MediaIntent,
): Promise<MediaIntent> {
  try {
    if (intent.mic !== controller.isMicrophoneEnabled) {
      if (intent.mic) await controller.enableMicrophone();
      else await controller.disableMicrophone();
    }
  } catch (err) {
    console.warn('[media] マイクの接続復帰に失敗しました', err);
  }

  try {
    if (intent.camera !== controller.isCameraEnabled) {
      if (intent.camera) await controller.enableCamera();
      else await controller.disableCamera();
    }
  } catch (err) {
    console.warn('[media] カメラの接続復帰に失敗しました', err);
  }

  return {
    mic: controller.isMicrophoneEnabled,
    camera: controller.isCameraEnabled,
  };
}
