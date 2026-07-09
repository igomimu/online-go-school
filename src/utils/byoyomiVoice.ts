// 秒読みの音声読み上げ（標準モード: 秒読みB秒 × N回、各回同じ長さ）。
//
// 読み上げ仕様（三村さん指定）:
//  - tens読み: 残り最後30秒ぶんの10秒刻み。30秒→「10,20」/60秒→「30,40,50」
//  - 最後の考慮時間（残1回）: tens →「1〜9」→ B秒で「時間切れです」
//  - 考慮時間が残る場合: tens →「(B-5)秒」「(B-2)秒」→ 消費時に
//      残り2回以上=「残りN回です」／残り1回になる=「最後の考慮時間です」
//      （「入りました」はTTSが「いりました」と誤読するため使わない）
//
// NHK杯方式（30秒秒読み＋考慮時間60秒×10）は別モードとして後日追加する。

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

let voiceEnabled = true;

/** 端末側の音声ON/OFF（ユーザー操作で切替可能にする用） */
export function setByoyomiVoiceEnabled(on: boolean): void {
  voiceEnabled = on;
}

export function isByoyomiVoiceEnabled(): boolean {
  return voiceEnabled;
}

/** ブラウザ内蔵音声（Web Speech API）で日本語読み上げ。未対応環境では無音。 */
export function speakByoyomi(text: string): void {
  if (!voiceEnabled) return;
  if (typeof window === 'undefined') return;
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
