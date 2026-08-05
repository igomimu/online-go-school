import type { Page } from '@playwright/test';

/**
 * 鳴らそうとした音の周波数を記録する。
 *
 * 通知音は Web Audio で合成しているので、実際に鳴ったかは自動では確かめられない。
 * オシレーターに指定された周波数を横取りして「どの高さの音を鳴らそうとしたか」だけ見る。
 * `frequency.value` を読むと、setValueAtTime で予約した値ではなく既定の 440Hz が返って
 * しまい何を鳴らしても 440 に見える。setValueAtTime の引数そのものを記録すること。
 * ページを開く前に仕込むこと。
 */
export async function recordNotificationSounds(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __soundHz?: number[]; AudioContext: typeof AudioContext };
    w.__soundHz = [];
    const RealAudioContext = w.AudioContext;
    class RecordingAudioContext extends RealAudioContext {
      createOscillator(): OscillatorNode {
        const osc = super.createOscillator();
        const setValueAtTime = osc.frequency.setValueAtTime.bind(osc.frequency);
        osc.frequency.setValueAtTime = (value: number, startTime: number) => {
          w.__soundHz?.push(Math.round(value));
          return setValueAtTime(value, startTime);
        };
        return osc;
      }
    }
    w.AudioContext = RecordingAudioContext;
  });
}

/** これまでに鳴らそうとした音の周波数（Hz） */
export async function playedSounds(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __soundHz?: number[] }).__soundHz ?? []);
}
