/**
 * 明暗テーマ。既定は今までどおり墨（ダーク）。
 *
 * 明背景に暗い文字のほうが、若年層でも高齢者でも読みの成績が良いことが分かっている
 * （Piepenbrock et al., Ergonomics 2013）。一方で白内障など目の中の透光体が濁って
 * いる人は暗背景のほうが読めるため、どちらかに寄せきらず選べる形にする。
 *
 * 現時点では対局画面のみライトに対応した試作段階なので、既定は 'dark' のまま。
 * 全画面が揃ったら既定を 'light' に変える（そのとき変えるのはこの DEFAULT_THEME だけ）。
 */
export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'go-school-theme';
const DEFAULT_THEME: Theme = 'dark';

function isTheme(value: string | null): value is Theme {
  return value === 'dark' || value === 'light';
}

/** URL の ?theme= が最優先（試作の確認用）。次に端末の保存値、無ければ既定。 */
export function resolveTheme(): Theme {
  const fromUrl = new URLSearchParams(window.location.search).get('theme');
  if (isTheme(fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // プライベートモード等で localStorage が使えなくても既定で動かす
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 保存できなくても今の表示は切り替わっている
  }
}

/** 起動時に一度だけ呼ぶ */
export function initTheme(): Theme {
  const theme = resolveTheme();
  applyTheme(theme);
  return theme;
}
