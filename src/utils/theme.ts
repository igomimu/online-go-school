/**
 * 明暗テーマ。既定は紙（ライト）。
 *
 * 明背景に暗い文字のほうが、若年層でも高齢者でも読みの成績が良いことが分かっている
 * （Piepenbrock et al., Ergonomics 2013）。一方で白内障など目の中の透光体が濁って
 * いる人と、暗い部屋では暗背景のほうが読みやすい。どちらかに寄せきらず、
 * ヘッダーのボタンでいつでも切り替えられるようにしてある。
 *
 * 選んだテーマは端末ごとに localStorage に残す（生徒それぞれが自分の見え方を選べる）。
 */
export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'go-school-theme';
const DEFAULT_THEME: Theme = 'light';

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

/** 現在のテーマ（html の data-theme を正とする） */
export function currentTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return isTheme(value ?? null) ? value : DEFAULT_THEME;
}
