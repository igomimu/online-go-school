import { useCallback, useRef } from 'react';

type SoundType = 'connect' | 'disconnect' | 'gameEnd' | 'chat';

// Web Audio APIで短い合成音を生成（音声ファイル不要）
function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.3) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);

    // クリーンアップ
    osc.onended = () => ctx.close();
  } catch {
    // AudioContext unavailable (e.g. before user interaction)
  }
}

function playDoubleBeep(freq1: number, freq2: number) {
  playTone(freq1, 0.15);
  setTimeout(() => playTone(freq2, 0.2), 180);
}

const SOUND_MAP: Record<SoundType, () => void> = {
  connect: () => playTone(880, 0.15, 'sine', 0.2),              // 軽い高音
  disconnect: () => playDoubleBeep(440, 330),                     // 低い警告2音
  gameEnd: () => {                                                // チャイム（高→低）
    playTone(660, 0.2, 'sine', 0.3);
    setTimeout(() => playTone(880, 0.3, 'sine', 0.3), 220);
  },
  chat: () => playTone(600, 0.1, 'sine', 0.15),                  // 軽いポップ音
};

export function useNotificationSound() {
  const enabledRef = useRef(true);
  const lastPlayRef = useRef<Record<string, number>>({});

  const play = useCallback((type: SoundType, throttleMs = 1000) => {
    if (!enabledRef.current) return;

    const now = Date.now();
    const lastPlay = lastPlayRef.current[type] || 0;
    if (now - lastPlay < throttleMs) return;

    lastPlayRef.current[type] = now;
    SOUND_MAP[type]();
  }, []);

  const setEnabled = useCallback((enabled: boolean) => {
    enabledRef.current = enabled;
  }, []);

  return { play, setEnabled };
}
