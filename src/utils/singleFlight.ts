/**
 * 同じ処理の実行中に再度呼ばれたら、進行中のPromiseを共有する。
 * 自動再試行と手動ボタンが重なっても、接続処理を二重に開始させないために使う。
 */
export function runSingleFlight<T>(
  holder: { current: Promise<T> | null },
  task: () => Promise<T>,
): Promise<T> {
  if (holder.current) return holder.current;

  const running = task().finally(() => {
    if (holder.current === running) holder.current = null;
  });
  holder.current = running;
  return running;
}
