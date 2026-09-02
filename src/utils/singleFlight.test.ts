import { describe, expect, it, vi } from 'vitest';
import { runSingleFlight } from './singleFlight';

describe('runSingleFlight', () => {
  it('処理中の再呼び出しでは同じPromiseを返し、処理を1回だけ実行する', async () => {
    let finish!: () => void;
    const task = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const holder = { current: null as Promise<void> | null };

    const first = runSingleFlight(holder, task);
    const second = runSingleFlight(holder, task);

    expect(first).toBe(second);
    expect(task).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(holder.current).toBeNull();
  });

  it('失敗後は次の試行を開始できる', async () => {
    const holder = { current: null as Promise<void> | null };
    await expect(runSingleFlight(holder, async () => { throw new Error('failed'); })).rejects.toThrow('failed');

    const next = vi.fn(async () => {});
    await runSingleFlight(holder, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
