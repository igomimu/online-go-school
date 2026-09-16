/**
 * 読み込み済みの stylesheet の中身を取り出す。別オリジンや読み込み前は null。
 * （同一オリジンなら cssRules を読めるので、取り直さずに中身をそのまま運べる）
 *
 * .sheet も .cssRules も別オリジンでは例外になりうるので、取得ごと try の中に置く。
 * ここで throw を漏らすと、Google Fonts のような別オリジンの CSS が1枚あるだけで
 * 複製が全部止まり、開いたウィンドウが無スタイルになる。
 */
function readCssText(node: HTMLLinkElement): string | null {
  try {
    const rules = node.sheet?.cssRules;
    if (!rules || rules.length === 0) return null;
    return Array.from(rules).map(rule => rule.cssText).join('\n');
  } catch {
    return null;
  }
}

/**
 * 本体の <style> と <link rel=stylesheet> を、開いたウィンドウの head へ複製する。
 *
 * 🔴 <link> をそのまま複製すると、新しいウィンドウが CSS を取り直すまでスタイルの
 * 無い素の HTML が描かれ、**碁盤が画面いっぱいに出てから正しい大きさへ縮む**
 * （2026-09-16 三村さん「碁盤が大きく開いてから収縮するまでラグがある」）。
 * 本体では既に読み込み済みなので、同一オリジンの CSS は中身を <style> に写して
 * 開いた瞬間から効かせる。読めないものだけ従来どおり <link> を張る。
 */
export function copyStyles(target: Document, source: Document = document): void {
  target.querySelectorAll('style[data-ogs-copied], link[data-ogs-copied]').forEach(el => el.remove());

  // <base> は入れない。about:blank は開いた側の base URL を引き継ぐので相対URLは解決でき、
  // 入れると盤の url(#…) 参照を壊す端末がある（2026-09-08 の石が消えた件と同じ根）。
  source.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => {
    const cssText = node instanceof HTMLLinkElement
      ? readCssText(node)
      : node.textContent;

    if (cssText) {
      const style = target.createElement('style');
      style.textContent = cssText;
      style.dataset.ogsCopied = '';
      target.head.appendChild(style);
      return;
    }

    if (node instanceof HTMLLinkElement) {
      const link = target.createElement('link');
      link.rel = 'stylesheet';
      // href プロパティは絶対URLを返す。about:blank から相対パスを引かせない
      link.href = node.href;
      if (node.crossOrigin) link.crossOrigin = node.crossOrigin;
      link.dataset.ogsCopied = '';
      target.head.appendChild(link);
    }
  });
}
