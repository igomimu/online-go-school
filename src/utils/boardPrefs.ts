/**
 * 盤の見え方に関する、端末ごとの好み。
 * 対局の内容ではないので、サーバーには持たせず localStorage に置く。
 */
const LAST_MOVE_KEY = 'ogs.lastMoveMarker';

/**
 * 直前に打たれた石へ▲を付けるか。
 * 「今どこに打たれたかがひと目で分かる」ため既定はON（三村さん指定 2026-08-04）。
 */
export function isLastMoveMarkerEnabled(): boolean {
  try {
    return localStorage.getItem(LAST_MOVE_KEY) !== 'off';
  } catch {
    return true; // localStorage が使えない環境でも既定の見え方は保つ
  }
}

export function setLastMoveMarkerEnabled(value: boolean): void {
  try {
    localStorage.setItem(LAST_MOVE_KEY, value ? 'on' : 'off');
  } catch {
    // 保存できなくても、今開いている画面には効いている
  }
}

const TAP_CONFIRM_KEY = 'ogs.tapConfirm';

/**
 * 指で打つときに、1回目のタップで拡大確認を挟むか。
 *
 * スマホの誤タップ対策として入れたものだが、Surface のようなタブレットPCでも
 * 「タッチ端末」と見なされて2回タップを求められていた（三村さん報告 2026-08-04）。
 * マウス・ペンで触っているときは自動で1回になるので、この設定は
 * 「指で打つときも1回で確定したい」人のためのもの。
 */
export function isTapConfirmEnabled(): boolean {
  try {
    return localStorage.getItem(TAP_CONFIRM_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setTapConfirmEnabled(value: boolean): void {
  try {
    localStorage.setItem(TAP_CONFIRM_KEY, value ? 'on' : 'off');
  } catch {
    // 保存できなくても、今開いている画面には効いている
  }
}
