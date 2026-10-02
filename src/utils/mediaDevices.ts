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
  groupId?: string;
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
      groupId: d.groupId,
    }));
}

/** 機器名がまだ取れない（＝許可を出していない）状態か */
export async function needsPermissionForLabels(kind: DeviceKind): Promise<boolean> {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  const all = await navigator.mediaDevices.enumerateDevices();
  const target = all.filter((d) => d.kind === kind);
  return target.length > 0 && target.every((d) => !d.label);
}

/**
 * 使わないマイク（除外リスト）。
 *
 * 配信用ミキサーのループバックや、カメラ・モニター内蔵のマイクなど、
 * 挿さっていても教室では絶対に使いたくない機器がある。ブラウザや OS の
 * 既定が勝手にそちらへ移ると、講師が気づかないまま授業が進んでしまう。
 * ここに登録した機器は、既定になっていても・選んだ機器が外れても使わない。
 *
 * deviceId はブラウザのデータ消去などで振り直されることがあるので、名前でも照合する。
 */
const EXCLUDED_MICS_KEY = 'go-school-excluded-mics';

export interface ExcludedMic {
  deviceId: string;
  label: string;
}

export function getExcludedMics(): ExcludedMic[] {
  try {
    const raw = localStorage.getItem(EXCLUDED_MICS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ExcludedMic => typeof m?.deviceId === 'string' && typeof m?.label === 'string',
    );
  } catch {
    return [];
  }
}

export function setMicExcluded(mic: ExcludedMic, excluded: boolean): ExcludedMic[] {
  const rest = getExcludedMics().filter((m) => !sameMic(m, mic));
  const next = excluded ? [...rest, { deviceId: mic.deviceId, label: mic.label }] : rest;
  try {
    if (next.length > 0) localStorage.setItem(EXCLUDED_MICS_KEY, JSON.stringify(next));
    else localStorage.removeItem(EXCLUDED_MICS_KEY);
  } catch {
    // 保存できなくても、今つないでいる間は除外が効いている
  }
  return next;
}

function sameMic(a: ExcludedMic, b: ExcludedMic): boolean {
  if (a.deviceId && a.deviceId === b.deviceId) return true;
  return !!a.label && a.label === b.label;
}

export function isExcludedMic(mic: ExcludedMic, excluded: ExcludedMic[] = getExcludedMics()): boolean {
  return excluded.some((m) => sameMic(m, mic));
}

/** Chrome の「既定」「通信」は実機の別名。実体を見ないと除外を判定できない */
const PSEUDO_DEVICE_IDS = new Set(['default', 'communications']);

export function isPseudoDevice(deviceId: string): boolean {
  return PSEUDO_DEVICE_IDS.has(deviceId);
}

type DeviceEntry = Pick<MediaDeviceInfo, 'deviceId' | 'groupId' | 'kind' | 'label'>;

/** 別名なら同じ groupId の実機へ置き換える（見つからなければそのまま） */
export function realMic(deviceId: string, all: DeviceEntry[]): DeviceEntry | undefined {
  const mics = all.filter((d) => d.kind === 'audioinput' && d.deviceId);
  const entry = mics.find((d) => d.deviceId === deviceId);
  if (!entry || !isPseudoDevice(deviceId)) return entry;
  return mics.find((d) => !isPseudoDevice(d.deviceId) && d.groupId === entry.groupId) ?? entry;
}

export type MicChoice =
  /** 除外も選択も無い。これまでどおりブラウザにまかせる */
  | { kind: 'browser' }
  /** この機器を使う（除外していない実機に固定する） */
  | { kind: 'device'; deviceId: string }
  /** 機器名がまだ取れず判定できない。点けたあとに実物を確かめる */
  | { kind: 'unknown' }
  /** 除外していないマイクが1台もつながっていない */
  | { kind: 'none' };

/**
 * どのマイクを使うか決める。
 * 選んだ機器 → OS の既定 → つながっている順、のうち除外していない最初の実機。
 * 除外があるときは「既定」の別名のままにせず実機へ固定する。別名のままだと、
 * 除外した機器を挿した瞬間に OS の既定がそちらへ移り、ブラウザが追いかけてしまう。
 */
export function chooseMic(
  all: DeviceEntry[],
  saved: string | null,
  excluded: ExcludedMic[],
): MicChoice {
  const mics = all.filter((d) => d.kind === 'audioinput' && d.deviceId);
  if (excluded.length === 0) return saved ? { kind: 'device', deviceId: saved } : { kind: 'browser' };
  if (mics.length === 0 || mics.every((d) => !d.label)) {
    return all.some((d) => d.kind === 'audioinput') ? { kind: 'unknown' } : { kind: 'none' };
  }
  const allowed = (id: string) => {
    const real = realMic(id, mics);
    return real && !isPseudoDevice(real.deviceId) && !isExcludedMic(real, excluded) ? real : undefined;
  };
  const picked = (saved ? allowed(saved) : undefined)
    ?? allowed('default')
    ?? mics.map((d) => allowed(d.deviceId)).find(Boolean);
  return picked ? { kind: 'device', deviceId: picked.deviceId } : { kind: 'none' };
}

export async function resolveMic(): Promise<MicChoice> {
  const all = navigator.mediaDevices?.enumerateDevices
    ? await navigator.mediaDevices.enumerateDevices()
    : [];
  return chooseMic(all, getSavedDeviceId('audioinput'), getExcludedMics());
}

/** いま音を拾っているトラックが除外した機器か */
export async function isTrackOnExcludedMic(track: MediaStreamTrack | undefined): Promise<boolean> {
  const excluded = getExcludedMics();
  if (!track || excluded.length === 0) return false;
  const deviceId = track.getSettings?.().deviceId ?? '';
  const all = navigator.mediaDevices?.enumerateDevices
    ? await navigator.mediaDevices.enumerateDevices()
    : [];
  const real = realMic(deviceId, all);
  return isExcludedMic({
    deviceId: real?.deviceId ?? deviceId,
    label: real?.label ?? track.label,
  }, excluded);
}

export const NO_ALLOWED_MIC_MESSAGE =
  '使えるマイクがつながっていません（つながっているマイクはすべて「使わない」に登録されています）。';
