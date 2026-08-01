import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePosition } from './katagoClient';

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
