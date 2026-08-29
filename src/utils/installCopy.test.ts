import { describe, expect, it } from 'vitest';
import { detectInstallPlatform, installCopy } from './installCopy';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Edg/126';

describe('次回すぐ開くための文言', () => {
  it('端末を見分ける', () => {
    expect(detectInstallPlatform(IPHONE)).toBe('ios');
    expect(detectInstallPlatform(ANDROID)).toBe('android');
    expect(detectInstallPlatform(WINDOWS)).toBe('desktop');
  });

  it('パソコンでは「アプリ」とも「インストール」とも言わない', () => {
    const copy = installCopy('desktop');
    expect(copy.action).toBe('デスクトップにアイコンを作る');
    for (const text of [copy.action, copy.short, copy.benefit]) {
      expect(text).not.toContain('アプリ');
      expect(text).not.toContain('インストール');
      expect(text).not.toContain('PWA');
    }
  });

  it('スマホではホーム画面の言葉を使う', () => {
    for (const platform of ['ios', 'android'] as const) {
      const copy = installCopy(platform);
      expect(copy.action).toContain('ホーム画面');
      expect(copy.benefit).toContain('ホーム画面');
      expect(copy.action).not.toContain('インストール');
    }
  });

  it('ブラウザ側に「インストール」と出る端末では、先に橋渡しの一行を持つ', () => {
    // こちらが言葉を避けても、押した先の画面で本人が遭遇するため
    expect(installCopy('desktop').note).toContain('アプリとしてインストール');
    expect(installCopy('android').note).toContain('インストール');
    // iOS は共有メニューからの手動追加で、その語が出ない
    expect(installCopy('ios').note).toBeUndefined();
  });

  it('手順の案内は、押す場所と見える文字を日本語で言う', () => {
    expect(installCopy('ios').steps).toContain('ホーム画面に追加');
    expect(installCopy('android').steps).toContain('ホーム画面に追加');
    // パソコンはメニューに「アプリ」と出てしまうので、そこは断り書きで受ける
    expect(installCopy('desktop').steps).toContain('デスクトップにアイコンができるだけです');
    expect(installCopy('desktop').steps).toContain('デスクトップにショートカットを作成');
  });
});
