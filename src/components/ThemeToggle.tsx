import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { currentTheme, setTheme, type Theme } from '../utils/theme';

/**
 * 明るい地／暗い地の切り替え。
 * どちらが読みやすいかは人によって割れる（明るい地のほうが読みの成績は良いが、
 * 白内障など目の中の透光体が濁っている人と、暗い部屋では暗い地のほうが楽）。
 * 選んだ結果は端末ごとに残るので、同じ教室でも生徒それぞれが自分の見え方を選べる。
 */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>(() => currentTheme());
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'dark' ? '暗い画面にする' : '明るい画面にする';

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={() => {
        setTheme(next);
        setThemeState(next);
      }}
      title={label}
      aria-label={label}
      className={`p-2 rounded-lg text-muted hover:text-ink hover:bg-ink/5 transition-colors duration-150 ${className}`}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
