// 秒読みの音声読み上げ（標準モード: 秒読みB秒 × N回、各回同じ長さ）。
//
// 読み上げ仕様（三村さん指定）:
//  - tens読み: 残り最後30秒ぶんの10秒刻み。30秒→「10,20」/60秒→「30,40,50」
//  - 最後の考慮時間（残1回）: tens →「1〜9」→ B秒で「時間切れです」
//  - 考慮時間が残る場合: tens →「(B-5)秒」「(B-2)秒」→ 消費時に
//      残り2回以上=「残りN回です」／残り1回になる=「最後の考慮時間です」
//      （「入りました」はTTSが「いりました」と誤読するため使わない）
//
// NHK杯方式は毎手30秒。考慮時間が残っていれば30秒で60秒の考慮時間へ入り、
// 残っていなければ21〜30秒を「1」〜「10」と読む。

/**
 * 秒読み中の各整数秒で読み上げる語句を返す（無ければ null）。
 * @param byoyomiSeconds 1回の秒読みの長さ B（10/20/30/60）
 * @param elapsed        現在の回で経過した秒（1..B の整数）
 * @param periodsLeft    残り回数（現在の回を含む。1 なら最後の回）
 */
export function getByoyomiAnnouncement(
  byoyomiSeconds: number,
  elapsed: number,
  periodsLeft: number,
): string | null {
  const B = Math.floor(byoyomiSeconds);
  const e = Math.floor(elapsed);
  if (B <= 0 || e < 1 || e > B) return null;

  const isFinal = periodsLeft <= 1;

  // tens読み: max(10, B-30) 〜 B-10 の10秒刻み
  const tensStart = Math.max(10, B - 30);
  if (e % 10 === 0 && e >= tensStart && e <= B - 10) {
    return `${e}秒`;
  }

  if (isFinal) {
    // 最後の回: 最後の10秒を 1〜10 とカウントする（B秒で「10」）。
    // 「時間切れ負けです」は時間切れ処理側で読み上げる。
    if (e >= B - 9 && e <= B) {
      return String(e - (B - 10)); // B-9→1, ..., B→10
    }
    return null;
  }

  // 考慮時間が残る回: (B-5)秒・(B-2)秒 の警告 → B秒で回を消費
  if (e === B - 5 && B - 5 > 0) return `${B - 5}秒`;
  if (e === B - 2 && B - 2 > 0) return `${B - 2}秒`;
  if (e === B) {
    const remaining = periodsLeft - 1; // この回を消費した後の残り
    if (remaining >= 2) return `残り${remaining}回です`;
    if (remaining === 1) return '最後の考慮時間です';
    return '時間切れ負けです'; // 念のため（本来 isFinal 側で処理）
  }
  return null;
}

/** NHK杯方式の通常30秒または60秒考慮時間で読む語句。 */
export function getNhkAnnouncement(
  elapsed: number,
  considerationsLeft: number,
  inConsideration: boolean,
): string | null {
  const duration = inConsideration ? 60 : 30;
  const e = Math.floor(elapsed);
  if (e < 1 || e > duration) return null;

  if (!inConsideration) {
    if (e === 10 || e === 20) return `${e}秒`;
    if (considerationsLeft > 0) {
      if (e === 25 || e === 28) return `${e}秒`;
      return null;
    }
    if (e >= 21) return String(e - 20);
    return null;
  }

  if (e === 30 || e === 40 || e === 50) return `${e}秒`;
  if (considerationsLeft > 0) {
    if (e === 55 || e === 58) return `${e}秒`;
    return null;
  }
  if (e >= 51) return String(e - 50);
  return null;
}

/** 考慮時間へ入った瞬間の案内。remaining は今回分を除いた残数。 */
export function getNhkConsiderationAnnouncement(total: number, remaining: number): string {
  const current = Math.max(1, total - remaining);
  return `${current}回目の考慮時間に入りました。残り${remaining}回です。`;
}

/** 60秒の考慮時間を使い切り、次の考慮時間へ続くときの案内。 */
export function getNhkContinuationAnnouncement(remaining: number): string {
  return `残り${Math.max(0, remaining)}回です。`;
}

/** 最後の考慮時間を使い切ったときの案内。 */
export function getNhkTimeUpAnnouncement(color: 'BLACK' | 'WHITE'): string {
  return `${color === 'BLACK' ? '黒' : '白'}の時間切れ負けです`;
}

let voiceEnabled = true;

/** 端末側の音声ON/OFF（ユーザー操作で切替可能にする用） */
export function setByoyomiVoiceEnabled(on: boolean): void {
  voiceEnabled = on;
}

export function isByoyomiVoiceEnabled(): boolean {
  return voiceEnabled;
}

// 直近に読み上げたフレーズ。同じ語が短時間に二度読まれるのを最後の砦として止める。
// 呼び出し側（useLiveGameのtick）にも重複防止キーがあるが、時計のRealtime巻き戻しや
// 盤コンポーネントの再マウントでキーの記憶ごとリセットされる経路が残っており、
// 稀に「最後の考慮時間です」等が2連続で読まれる（2026-08-01 E2Eで再現）。
// 秒読みのカウントは1秒刻みで必ず語が変わるため、同一語の連続は常に異常とみなせる。
let lastSpoken: { text: string; at: number } | null = null;
const DUPLICATE_SUPPRESS_MS = 1500;

/** テスト用: 重複抑止の記憶をリセットする */
export function resetByoyomiVoiceState(): void {
  lastSpoken = null;
}

/** ブラウザ内蔵音声（Web Speech API）で日本語読み上げ。未対応環境では無音。 */
export function speakByoyomi(text: string): void {
  if (!voiceEnabled) return;
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (lastSpoken && lastSpoken.text === text && now - lastSpoken.at < DUPLICATE_SUPPRESS_MS) return;
  lastSpoken = { text, at: now };
  const synth = window.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = 1.1;
    u.volume = 1;
    // カウントは短い語なので、溜まった発話をキャンセルして最新を優先
    synth.cancel();
    synth.speak(u);
  } catch {
    // 読み上げ失敗は無視（対局進行に影響させない）
  }
}
