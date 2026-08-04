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
