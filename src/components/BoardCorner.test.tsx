import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BoardCorner from './BoardCorner';

describe('BoardCorner', () => {
  // 木目は pattern、溶かしは linearGradient への参照だった。SVG の url(#…) 参照を
  // 解決できない端末があり、そこでは木目が出ず盤が四角く切れて見える（2026-09-08）。
  it('SVGの url(#…) 参照を使わない', () => {
    const { container } = render(<BoardCorner />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg!.innerHTML).not.toContain('url(#');
    expect(container.querySelector('pattern')).toBeNull();
    expect(container.querySelector('linearGradient')).toBeNull();
  });

  it('木目のテクスチャを原寸で並べて盤を覆う', () => {
    const { container } = render(<BoardCorner />);
    const images = container.querySelectorAll('image');
    expect(images.length).toBeGreaterThanOrEqual(4);
    images.forEach(img => {
      expect(img.getAttribute('href')).toBe('/wood-board-texture-v2.webp');
      expect(img.getAttribute('width')).toBe('512');
    });
  });

  it('地の色へ溶かす帯を段で敷く', () => {
    const { container } = render(<BoardCorner />);
    const fades = Array.from(container.querySelectorAll('rect'))
      .filter(r => r.getAttribute('fill') === 'var(--color-ground)' && r.getAttribute('opacity') !== '0.42');
    // 縦横それぞれ24段
    expect(fades.length).toBe(48);
  });
});
