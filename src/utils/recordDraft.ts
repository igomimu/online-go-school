/**
 * 「棋譜を並べる」画面の下書き。
 *
 * 並べている途中に先生が検討や詰碁を始めると、生徒の画面はそちらへ切り替わる
 * （授業の主導は先生側にある、という今の作りを変えないため）。
 * 切り替わる前にここへ残しておき、次に開いたとき「前回の続きから」を出す。
 *
 * 端末内だけの控え。localStorage が使えない環境では黙って何もしない。
 */

const KEY = 'go-school-record-draft';

export interface RecordDraft {
  sgf: string;
  boardSize: number;
  /** 保存した時刻（ms）。復元するか決めるときの手掛かりとして見せる */
  savedAt: number;
}

export function saveRecordDraft(sgf: string, boardSize: number, now: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ sgf, boardSize, savedAt: now } satisfies RecordDraft));
  } catch {
    // localStorage が使えない・容量超過。下書きは諦める
  }
}

export function loadRecordDraft(): RecordDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RecordDraft>;
    if (typeof parsed?.sgf !== 'string' || !parsed.sgf) return null;
    if (typeof parsed.boardSize !== 'number' || parsed.boardSize < 5) return null;
    return { sgf: parsed.sgf, boardSize: parsed.boardSize, savedAt: parsed.savedAt ?? 0 };
  } catch {
    return null;
  }
}

export function clearRecordDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 消せなくても実害はない
  }
}
