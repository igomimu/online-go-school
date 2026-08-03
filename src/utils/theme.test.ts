import { describe, it, expect, beforeEach } from 'vitest';
import { initTheme, currentTheme, setTheme, resolveTheme } from './theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    window.history.replaceState({}, '', '/');
  });

  it('何も保存されていなければ明るい地で始まる', () => {
    expect(resolveTheme()).toBe('light');
    expect(initTheme()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('切り替えると html に反映され、端末に残る', () => {
    initTheme();
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(currentTheme()).toBe('dark');
    expect(resolveTheme()).toBe('dark'); // 次に開いたときも暗いまま
  });

  it('URL の ?theme= が保存値より優先される（確認用）', () => {
    setTheme('dark');
    window.history.replaceState({}, '', '/?theme=light');
    expect(resolveTheme()).toBe('light');
  });

  it('壊れた保存値は無視して既定に戻す', () => {
    localStorage.setItem('go-school-theme', 'sepia');
    expect(resolveTheme()).toBe('light');
  });
});
