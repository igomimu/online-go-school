import { useEffect, useState } from 'react';

/**
 * 配信されている版と、いま動いている版がずれていないか見張る。
 *
 * 2026-08-26、映像基盤の入れ替えで何度も直しては配ったが、開いたままの端末は
 * 古いまま動き続け、直したはずの不具合が出続けた。PWA は仕様上、閉じて開いても
 * 1回では切り替わらないことがある。気づく手立てが無いのが混乱の一因だった。
 *
 * `version.json` は Service Worker が素通しする設定（NetworkOnly）なので、
 * 見に行けば必ず今 配信されているものが返る。
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function useAppVersionCheck(): { updateAvailable: boolean; reload: () => void } {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    let alive = true;

    const check = async () => {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json() as { version?: string };
        const served = typeof data.version === 'string' ? data.version : '';
        if (!served) return;
        const mine = __COMMIT_HASH__;
        // 🔴 version.json は40文字のフルハッシュ、アプリが持つのは7文字の短縮版。
        // そのまま比べると必ず食い違い、読み込み直しても帯が出続ける（2026-08-26）。
        // git が使えない環境では 'no-git' などが入るので、そのときは比べない。
        if (!mine || mine === 'no-git' || mine === 'unknown') return;
        const same = served.startsWith(mine) || mine.startsWith(served);
        if (alive && !same) setUpdateAvailable(true);
      } catch {
        // 見に行けなくても、それ自体は知らせない（回線が細いだけのことがある）
      }
    };

    void check();
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
    // 画面に戻ってきたときも見る。閉じて開き直したのに古いまま、を拾う
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const reload = () => {
    // Service Worker を捨ててから読み直す。これをしないと古いものが配られ続ける
    void (async () => {
      try {
        const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = await caches?.keys?.() ?? [];
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        // 消せなくても読み直しは試みる
      }
      window.location.reload();
    })();
  };

  return { updateAvailable, reload };
}
