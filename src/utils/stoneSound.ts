// 対局中の効果音（着手音・石を取る音）。
// 音源は囲Trap（いごぽん）用に自作したものを流用（ishioto1-3 / nuki1-2）。
//
// 設計メモ:
//  - Web Audio API で事前デコードして鳴らす。<audio>要素の連打は遅延・取りこぼしが出るため使わない。
//  - AudioContext はブラウザの自動再生ポリシーにより、ユーザー操作前は suspended のまま。
//    最初のクリック/タップで unlock する（unlockStoneSound を1度だけ登録）。
//  - ON/OFF は localStorage に永続化（端末ごとの設定）。

const STORAGE_KEY = 'ogs.stoneSoundEnabled';
const VOLUME = 0.6;

const STONE_FILES = ['ishioto1.ogg', 'ishioto2.ogg', 'ishioto3.ogg'] as const;
const CAPTURE_FILES = ['nuki1.ogg', 'nuki2.ogg', 'nuki3.ogg'] as const;
const ALL_FILES = [...STONE_FILES, ...CAPTURE_FILES];

let enabled = readEnabled();
let ctx: AudioContext | null = null;
let preloadStarted = false;
const buffers = new Map<string, AudioBuffer>();

function readEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true; // localStorage が使えない環境では既定ON
  }
}

export function isStoneSoundEnabled(): boolean {
  return enabled;
}

export function setStoneSoundEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'on' : 'off');
  } catch {
    // 保存できなくても当該セッションでは効くのでそのまま
  }
  if (value) void ensureReady();
}

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/** 音源のデコードを開始する（多重呼び出し可）。 */
export async function ensureReady(): Promise<void> {
  const c = getContext();
  if (!c || preloadStarted) return;
  preloadStarted = true;
  await Promise.all(
    ALL_FILES.map(async (name) => {
      try {
        const res = await fetch(`/audio/se/${name}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await c.decodeAudioData(await res.arrayBuffer());
        buffers.set(name, buf);
      } catch {
        // 1ファイル失敗しても他の音は鳴らす（対局進行に影響させない）
      }
    }),
  );
}

/** ユーザー操作時に呼ぶ。suspended の AudioContext を再開する。 */
export function unlockStoneSound(): void {
  const c = getContext();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  void ensureReady();
}

function play(name: string, delayMs = 0): void {
  const c = getContext();
  if (!c) return;
  const buf = buffers.get(name);
  if (!buf) {
    void ensureReady(); // 初回はまだロード中のことがある。次の手には間に合う
    return;
  }
  try {
    const source = c.createBufferSource();
    source.buffer = buf;
    const gain = c.createGain();
    gain.gain.value = VOLUME;
    source.connect(gain);
    gain.connect(c.destination);
    source.start(c.currentTime + delayMs / 1000);
  } catch {
    // 再生失敗は無視
  }
}

/**
 * 「今の盤面変化で着手音を鳴らすべきか」の判定（副作用なし・テスト用に分離）。
 * 鳴らすのは “ちょうど1手増えて、それが盤上への着手だったとき” だけ。
 * 初回マウント（既存棋譜の一括読み込み）・待った・リセット・再同期では鳴らさない。
 */
export function shouldPlayMoveSound(
  prevMoveNumber: number | null,
  moveNumber: number,
  lastMove: { x: number; y: number } | null,
): boolean {
  if (prevMoveNumber === null) return false;
  if (moveNumber !== prevMoveNumber + 1) return false;
  if (!lastMove) return false;
  if (lastMove.x === 0 && lastMove.y === 0) return false; // パス
  return true;
}

/** 着手音（3種からランダム）。 */
export function playStoneSound(): void {
  if (!enabled) return;
  play(STONE_FILES[Math.floor(Math.random() * STONE_FILES.length)]);
}

/**
 * 抜き音の段階。min 以上の石数でその音を鳴らす（多いほうから先に判定する）。
 *
 * 実際の碁盤では、取った石が多いほど抜く音は長く鳴る（2026-08-20 三村さんの指摘）。
 * nuki1 と nuki2 は 0.74 / 0.80 秒でほぼ同じ長さのため、音色は変わっても
 * 「量が伝わらない」状態だった。長い音 nuki3（1.60秒）を足して3段階にしている。
 *
 * しきい値はここだけを直せば変えられる。
 */
export const CAPTURE_STEPS = [
  { min: 5, file: 'nuki3.ogg' },  // たくさん抜いた
  { min: 2, file: 'nuki2.ogg' },
  { min: 1, file: 'nuki1.ogg' },  // 1子
] as const;

/** 後方互換（旧: 3子以上で大きい音）。 */
export const MANY_CAPTURES = 5;

/**
 * 石を取った音。着手音の直後に少し遅らせて重ねる（実際の対局でも打つ→抜くの順）。
 *
 * @param count 取った石数
 */
export function playCaptureSound(count: number): void {
  if (!enabled) return;
  const step = CAPTURE_STEPS.find((s) => count >= s.min) ?? CAPTURE_STEPS[CAPTURE_STEPS.length - 1];
  play(step.file, 140);
}
