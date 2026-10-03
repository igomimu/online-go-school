import type { Problem } from '../types/problem';

/**
 * 詰碁の中断データ（下書き）。
 *
 * 生徒が取組中に先生が検討や対局を始めると画面が切り替わる（授業の主導は先生側）。
 * その際、未クリアの問題と進捗（問題番号・正解数・失敗数）をここへ退避し、
 * ロビーに戻ったときや次回出題時に同じ場所から再開できるようにする。
 */

const KEY_PREFIX = 'go-school-tsumego-draft';
/** これより古い続きは出さない（翌週の授業に先週の詰碁が「中断中」で出ないように） */
export const TSUMEGO_DRAFT_TTL_MS = 12 * 60 * 60 * 1000;

export interface TsumegoProgress {
  problemNo: number;
  solved: number;
  failed: number;
}

export interface TsumegoDraft {
  problem: Problem;
  progress: TsumegoProgress;
  savedAt: number;
}

function getStorageKey(scope?: string): string {
  return scope ? `${KEY_PREFIX}_${scope}` : KEY_PREFIX;
}

export function saveTsumegoDraft(draft: TsumegoDraft, scope?: string): void {
  try {
    const key = getStorageKey(scope);
    localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // localStorage が使えない環境では何もしない
  }
}

export function loadTsumegoDraft(scope?: string): TsumegoDraft | null {
  try {
    const key = getStorageKey(scope);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TsumegoDraft>;
    if (!parsed?.problem || typeof parsed.problem.id !== 'string') return null;
    if (!parsed.progress || typeof parsed.progress.problemNo !== 'number') return null;
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > TSUMEGO_DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return {
      problem: parsed.problem,
      progress: {
        problemNo: parsed.progress.problemNo,
        solved: parsed.progress.solved ?? 0,
        failed: parsed.progress.failed ?? 0,
      },
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearTsumegoDraft(scope?: string): void {
  try {
    const key = getStorageKey(scope);
    localStorage.removeItem(key);
  } catch {
    // 消せなくても実害はない
  }
}
