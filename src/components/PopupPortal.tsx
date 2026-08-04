import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HostWindowContext } from '../hooks/useHostWindow';

/**
 * 中身を別ウィンドウに描く。
 *
 * 対局の別ウィンドウ（`?mode=game`）は Supabase が正本なので独立したページとして
 * 開けるが、検討の手順はメモリ上にあり LiveKit で生徒へ配っている。同じ identity で
 * LiveKit をもう1本張れないため、**JS の文脈は本体のまま、描画先だけを別ウィンドウに
 * 移す**（createPortal）方式にしている。配信まわりのコードには一切触らない。
 *
 * 注意している点:
 * - 開いたウィンドウには何のスタイルも無いので、本体の <style>/<link> を複製する
 *   （Vite は dev で <style>、本番で <link>）
 * - テーマ（data-theme）も移す。これが無いと配色トークンが全部既定値になる
 * - キーボードは本体ではなく**このウィンドウ**に張る必要がある。中身のコンポーネントは
 *   useHostWindow() でこのウィンドウを受け取る
 * - 本体を閉じる・遷移するときは道連れで閉じる（孤児ウィンドウを残さない）
 */

interface PopupPortalProps {
  /** ウィンドウ名。同じ名前で開き直すと既存ウィンドウが再利用される */
  name: string;
  title: string;
  features?: string;
  /** ウィンドウが閉じられた（利用者が×を押した） */
  onClose: () => void;
  /** ポップアップがブロックされて開けなかった */
  onBlocked?: () => void;
  /** body 直下に置くラッパーの class */
  className?: string;
  children: React.ReactNode;
}

/** 本体の <style> と <link rel=stylesheet> を、開いたウィンドウの head へ複製する */
function copyStyles(target: Document): void {
  target.querySelectorAll('style[data-ogs-copied], link[data-ogs-copied]').forEach(el => el.remove());
  document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
    if (node instanceof HTMLLinkElement) {
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      // href プロパティは絶対URLを返す。about:blank から相対パスを引かせない
      link.href = node.href;
      if (node.crossOrigin) link.crossOrigin = node.crossOrigin;
      link.dataset.ogsCopied = '';
      target.head.appendChild(link);
    } else {
      const style = node.cloneNode(true) as HTMLStyleElement;
      style.dataset.ogsCopied = '';
      target.head.appendChild(style);
    }
  });
}

/**
 * 画面に収まる範囲でなるべく大きく開く。
 * 幅は 1024px（Tailwind の lg）を割ると碁盤と情報欄が縦積みになってしまうので、
 * 狭い画面でもそこは下回らないようにする。
 */
/**
 * 閉じる予定のウィンドウ（ウィンドウ名 → タイマー）。
 *
 * 開発時の StrictMode は effect を「実行→後片付け→もう一度実行」と2回走らせる。
 * 後片付けで即座に閉じると、2回目で別のウィンドウが開き直され、最初のウィンドウを
 * 掴んでいた側（E2E など）は閉じた抜け殻を見ることになる。そこで閉じるのは次の
 * タスクへ回し、その間に張り直されたら取り消して同じウィンドウを使い続ける。
 */
const pendingClose = new Map<string, number>();

function defaultFeatures(): string {
  const w = Math.max(1024, Math.min(1400, window.screen.availWidth || 1400));
  const h = Math.min(950, window.screen.availHeight || 950);
  return `width=${w},height=${h},menubar=no,toolbar=no,location=no,status=no`;
}

export default function PopupPortal({
  name,
  title,
  features,
  onClose,
  onBlocked,
  className,
  children,
}: PopupPortalProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [popup, setPopup] = useState<Window | null>(null);
  // 閉じたことの通知は「利用者が×を押した」ときだけにしたい。
  // アンマウントで自分から閉じるときは呼ばない
  const onCloseRef = useRef(onClose);
  const onBlockedRef = useRef(onBlocked);
  useEffect(() => {
    onCloseRef.current = onClose;
    onBlockedRef.current = onBlocked;
  }, [onClose, onBlocked]);

  useEffect(() => {
    const scheduled = pendingClose.get(name);
    if (scheduled !== undefined) {
      window.clearTimeout(scheduled);
      pendingClose.delete(name);
    }
    // 同じ名前で開くと既存ウィンドウが再利用される（閉じ待ちのものもここで拾う）
    const win = window.open('', name, features ?? defaultFeatures());
    if (!win) {
      onBlockedRef.current?.();
      return;
    }

    const doc = win.document;
    doc.title = title;
    doc.documentElement.lang = 'ja';
    doc.documentElement.dataset.theme = document.documentElement.dataset.theme ?? 'light';
    copyStyles(doc);

    // 開き直し（同名ウィンドウの再利用）のとき、前回の中身が残っていることがある
    doc.body.innerHTML = '';
    const mount = doc.createElement('div');
    if (className) mount.className = className;
    doc.body.appendChild(mount);

    // 本体を閉じる・リロードするときは道連れで閉じる
    const closePopup = () => win.close();
    window.addEventListener('beforeunload', closePopup);

    // 利用者が×で閉じたのを拾う（beforeunload は同一オリジンでも取りこぼすことがある）
    const timer = window.setInterval(() => {
      if (win.closed) {
        window.clearInterval(timer);
        onCloseRef.current();
      }
    }, 400);

    win.focus();
    setPopup(win);
    setContainer(mount);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('beforeunload', closePopup);
      setContainer(null);
      setPopup(null);
      pendingClose.set(name, window.setTimeout(() => {
        pendingClose.delete(name);
        if (!win.closed) win.close();
      }, 0));
    };
    // name/features/title の変更で開き直さない（検討中に開き直すと配信が途切れる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!container || !popup) return null;

  return createPortal(
    <HostWindowContext.Provider value={popup}>{children}</HostWindowContext.Provider>,
    container,
  );
}
