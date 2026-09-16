import { describe, expect, it } from 'vitest';
import { copyStyles } from './copyStyles';

/** 別ウィンドウに見立てた空のドキュメント */
function makeTargetDoc(): Document {
  return document.implementation.createHTMLDocument('popup');
}

/** 読み込み済みの <link rel=stylesheet> を装う（sheet は jsdom では生えない） */
function makeLink(doc: Document, href: string, getSheet: () => Partial<CSSStyleSheet> | null): HTMLLinkElement {
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  Object.defineProperty(link, 'sheet', { get: getSheet, configurable: true });
  return link;
}

describe('copyStyles', () => {
  it('同一オリジンの CSS は中身を <style> に写す（新しいウィンドウが取り直すのを待たせない）', () => {
    const source = makeTargetDoc();
    source.head.appendChild(makeLink(source, 'https://example.test/app.css', () => ({
      cssRules: [{ cssText: '.board{width:100%}' }] as unknown as CSSRuleList,
    })));
    const target = makeTargetDoc();

    copyStyles(target, source);

    expect(target.querySelectorAll('link[data-ogs-copied]')).toHaveLength(0);
    expect(target.querySelector('style[data-ogs-copied]')?.textContent).toBe('.board{width:100%}');
  });

  it('中身を読めない CSS（別オリジン）は <link> で張る', () => {
    const source = makeTargetDoc();
    source.head.appendChild(makeLink(source, 'https://cdn.example.test/other.css', () => {
      throw new DOMException('cross-origin');
    }));
    const target = makeTargetDoc();

    copyStyles(target, source);

    expect(target.querySelector('link[data-ogs-copied]')?.getAttribute('href'))
      .toBe('https://cdn.example.test/other.css');
  });

  it('<style> はそのまま写す', () => {
    const source = makeTargetDoc();
    const style = source.createElement('style');
    style.textContent = '.a{color:red}';
    source.head.appendChild(style);
    const target = makeTargetDoc();

    copyStyles(target, source);

    expect(target.querySelector('style[data-ogs-copied]')?.textContent).toBe('.a{color:red}');
  });

  it('開き直しても複製が二重にならない', () => {
    const source = makeTargetDoc();
    const style = source.createElement('style');
    style.textContent = '.a{color:red}';
    source.head.appendChild(style);
    const target = makeTargetDoc();

    copyStyles(target, source);
    copyStyles(target, source);

    expect(target.querySelectorAll('style[data-ogs-copied]')).toHaveLength(1);
  });

  it('<base> は入れない（盤の url(#…) 参照を壊さない）', () => {
    const source = makeTargetDoc();
    const target = makeTargetDoc();

    copyStyles(target, source);

    expect(target.querySelector('base')).toBeNull();
  });
});
