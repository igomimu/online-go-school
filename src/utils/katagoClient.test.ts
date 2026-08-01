import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePosition, loadAiSettings, saveAiSettings } from './katagoClient';

describe('AI設定', () => {
  beforeEach(() => localStorage.clear());

  it('未設定時はPocket KataGoと同じ3000 visitsを使う', () => {
    expect(loadAiSettings()).toEqual({ enabled: false, maxVisits: 3000 });
  });

  it('旧端末設定が100 visitsでも一度だけ3000へ移行する', () => {
    localStorage.setItem('go-school-ai-settings', JSON.stringify({ enabled: true, maxVisits: 100 }));
    expect(loadAiSettings()).toEqual({ enabled: true, maxVisits: 3000 });
    expect(JSON.parse(localStorage.getItem('go-school-ai-settings') || '{}')).toMatchObject({
      enabled: true,
      maxVisits: 3000,
      version: 2,
    });
  });

  it('移行後に利用者が1000を選んだ場合は維持する', () => {
    saveAiSettings({ enabled: true, maxVisits: 1000 });
    expect(loadAiSettings()).toEqual({ enabled: true, maxVisits: 1000 });
  });
});

describe('analyzePosition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('中継APIが応答しない場合は20秒で解析待ちを終了する', async () => {
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      }, { once: true });
    })));

    const pending = analyzePosition({
      moves: [],
      boardSize: 9,
      komi: 6.5,
      maxVisits: 100,
    });
    const rejection = expect(pending).rejects.toThrow('AI分析サーバーから20秒以内に応答がありませんでした');

    await vi.advanceTimersByTimeAsync(20_000);
    await rejection;
  });
});
