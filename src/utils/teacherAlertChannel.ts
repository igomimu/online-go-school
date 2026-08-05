import type { ClassroomAlert } from '../components/teacher/ClassroomAlerts';

/**
 * 講師への知らせを、教室ホームから対局ウィンドウへ渡す。
 *
 * 対局ウィンドウを前面にしていると教室ホームの知らせは背面に隠れてしまうので、
 * 打っている最中でも別の生徒の時間切れ・接続切れに気づけるように同じものを出す
 * （2026-08-05 三村さん）。
 *
 * 見つける側は教室ホームだけ（LiveKitの接続も対局一覧も持っているのはこちら）。
 * 音も教室ホームで鳴らす。対局ウィンドウは受け取って表示するだけなので、
 * 同じ音が二重に鳴ることはない。
 */

const CHANNEL_NAME = 'ogs-teacher-alerts';

function openChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

/** 知らせを他のウィンドウへ送る（送れなくても本体の表示には影響しない） */
export function postTeacherAlert(alert: ClassroomAlert): void {
  const channel = openChannel();
  if (!channel) return;
  try {
    channel.postMessage(alert);
  } finally {
    channel.close();
  }
}

/** 受け取る。戻り値を呼ぶと購読をやめる */
export function subscribeTeacherAlerts(onAlert: (alert: ClassroomAlert) => void): () => void {
  const channel = openChannel();
  if (!channel) return () => {};
  const handler = (event: MessageEvent) => {
    const alert = event.data as ClassroomAlert | undefined;
    if (alert && typeof alert.id === 'number' && typeof alert.kind === 'string') {
      onAlert(alert);
    }
  };
  channel.addEventListener('message', handler);
  return () => {
    channel.removeEventListener('message', handler);
    channel.close();
  };
}
