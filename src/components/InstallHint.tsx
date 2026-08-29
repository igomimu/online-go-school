import { useState } from 'react';
import { Download } from 'lucide-react';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { installCopy } from '../utils/installCopy';

const DISMISS_KEY = 'go-school-install-hint-dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 初めて教室に入れた生徒に、次回の入り口を1回だけ案内する。
 *
 * ログイン画面の薄い文字リンクでは大人はまず気づかない。うまく入れた直後の
 * ロビーに出すほうが素直に届く。「あとで」を押したら二度と出さない。
 *
 * 言葉は端末ごとに結果だけを書く（[[installCopy]]）。「アプリ」「インストール」
 * 「PWA」はこちらからは言わない。パソコンで「アプリ」と言うと通じない。
 */
export default function InstallHint() {
  const pwaInstall = usePwaInstall();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed || !pwaInstall.shouldShowInstall) return null;

  const copy = installCopy();

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // localStorage が使えない端末では、その回だけ消える
    }
    setDismissed(true);
  };

  const handleInstall = async () => {
    const accepted = await pwaInstall.install();
    // 断られたときは残す（手順の案内を読んでから、もう一度押せる）
    if (accepted) dismiss();
  };

  return (
    <div data-testid="install-hint" className="glass-panel border-l-2 border-l-accent p-5 sm:p-6">
      <h3 className="text-base font-semibold">次回から、すぐ開けるようにできます</h3>
      <p className="mt-2 text-sm text-muted [word-break:auto-phrase]">{copy.benefit}</p>
      {copy.note && (
        <p className="mt-1 text-xs text-muted [word-break:auto-phrase]">{copy.note}</p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          data-testid="install-hint-accept"
          onClick={() => void handleInstall()}
          className="premium-button flex items-center gap-2 text-sm"
        >
          <Download className="h-4 w-4" />
          {copy.action}
        </button>
        <button
          data-testid="install-hint-dismiss"
          onClick={dismiss}
          className="secondary-button text-sm"
        >
          あとで
        </button>
      </div>
    </div>
  );
}
