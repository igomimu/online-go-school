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

function storageKey(role: MediaIntentRole): string {
  return `go-school-media-intent-${role.toLowerCase()}`;
}

/**
 * 最後に本人が使っていたマイク・カメラ状態。
 * LiveKitのトラック状態とは分けて保存し、Room再作成やページ再読込の後に復元する。
 */
export function loadMediaIntent(role: MediaIntentRole): MediaIntent {
  try {
    const raw = localStorage.getItem(storageKey(role));
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

export function saveMediaIntent(role: MediaIntentRole, intent: MediaIntent): void {
  try {
    localStorage.setItem(storageKey(role), JSON.stringify(intent));
  } catch {
    // 保存できなくても現在の通話操作は続けられる。
  }
}

export function clearMediaIntent(role: MediaIntentRole): void {
  try {
    localStorage.removeItem(storageKey(role));
  } catch {
    // 明示的な退出処理自体は止めない。
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
