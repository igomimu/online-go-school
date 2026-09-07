/**
 * 新しい版を配ったとき、その端末を自動で読み込み直してよいかどうか。
 *
 * 🔴 2026-09-07、授業中に本番へ配ったところ、開いていた生徒の画面が1分以内に
 * 勝手に再読み込みされ、教室との接続が切れた（RealtimeKit の記録で、配信の直後に
 * 生徒2人の接続が正常な退出記録を残さずに終わっていた）。
 * Service Worker が autoUpdate で、更新を掴むと `window.location.reload()` を
 * 全端末で走らせていたため。
 *
 * 教室に入っていない端末（ログイン画面・待機中）は今までどおり自動で新しくする。
 * 授業中の端末は帯を出すだけにして、押されたときだけ読み込み直す。
 */
export interface AppUpdateSituation {
  /** 配信されている版と、いま動いている版がずれている */
  updateAvailable: boolean;
  /** 教室（RTC）に接続している＝授業中 */
  isConnected: boolean;
  /** 保存していない入力を抱えている（棋譜作成の途中など） */
  hasUnsavedWork: boolean;
  /** この画面で既に自動で読み込み直した（繰り返し防止） */
  alreadyReloaded: boolean;
}

export function shouldAutoReload(s: AppUpdateSituation): boolean {
  if (!s.updateAvailable) return false;
  if (s.alreadyReloaded) return false;
  if (s.isConnected) return false;
  if (s.hasUnsavedWork) return false;
  return true;
}
