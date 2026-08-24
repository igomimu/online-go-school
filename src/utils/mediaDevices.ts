/**
 * 使用するマイク・カメラの選択。
 *
 * 選ばなければブラウザの既定機器が使われる。配信用マイクや外付けカメラを
 * 挿している環境では意図しないほうを掴むことがあり、これまでアプリ側から
 * 変える手立てが無かった（ブラウザ設定か OS 設定に行くしかなかった）。
 *
 * 選んだ機器は端末ごとに localStorage へ残す。「回線復旧」は Room を作り直すので、
 * 覚えておかないと復旧のたびに既定機器へ戻ってしまう。
 */
export type DeviceKind = 'audioinput' | 'videoinput';

export interface MediaDeviceChoice {
  deviceId: string;
  label: string;
}

const STORAGE_KEY: Record<DeviceKind, string> = {
  audioinput: 'go-school-device-mic',
  videoinput: 'go-school-device-camera',
};

export const DEVICE_LABEL: Record<DeviceKind, string> = {
  audioinput: 'マイク',
  videoinput: 'カメラ',
};

/** 端末に保存した選択（未選択なら null＝ブラウザの既定にまかせる） */
export function getSavedDeviceId(kind: DeviceKind): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY[kind]);
  } catch {
    return null;
  }
}

export function saveDeviceId(kind: DeviceKind, deviceId: string | null): void {
  try {
    if (deviceId) localStorage.setItem(STORAGE_KEY[kind], deviceId);
    else localStorage.removeItem(STORAGE_KEY[kind]);
  } catch {
    // 保存できなくても、今つないでいる間は選択が効いている
  }
}

/**
 * 自分の映像を左右反転して見るかどうか（端末ごと）。
 *
 * 既定は反転しない。生徒に届いているのは実像なので、碁盤や本を映したときに
 * 講師の画面だけ左右が逆になるのを避ける。顔を映して位置を合わせたいときは
 * 鏡と同じ向きのほうが扱いやすいので、設定で戻せるようにしてある。
 */
const MIRROR_KEY = 'go-school-mirror-local-video';
/** 設定の変更を、同じ画面の映像タイルへ知らせる合図 */
export const MIRROR_EVENT = 'go-school:mirror-local-video';

export function getMirrorLocalVideo(): boolean {
  try {
    return localStorage.getItem(MIRROR_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMirrorLocalVideo(on: boolean): void {
  try {
    if (on) localStorage.setItem(MIRROR_KEY, '1');
    else localStorage.removeItem(MIRROR_KEY);
  } catch {
    // 保存できなくても、今つないでいる間は切替が効いている
  }
  try {
    window.dispatchEvent(new CustomEvent(MIRROR_EVENT, { detail: on }));
  } catch {
    // イベントを出せない環境では次に画面を開いたときから効く
  }
}

/**
 * つながっている機器の一覧。
 * 名前（label）は、一度でもマイク・カメラの許可を出すまで空で返る仕様なので、
 * 空のときは呼び出し側で「一度オンにしてください」と案内する。
 */
export async function listDevices(kind: DeviceKind): Promise<MediaDeviceChoice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === kind && d.deviceId)
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `${DEVICE_LABEL[kind]} ${i + 1}`,
    }));
}

/** 機器名がまだ取れない（＝許可を出していない）状態か */
export async function needsPermissionForLabels(kind: DeviceKind): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  const all = await navigator.mediaDevices.enumerateDevices();
  const target = all.filter((d) => d.kind === kind);
  return target.length > 0 && target.every((d) => !d.label);
}
