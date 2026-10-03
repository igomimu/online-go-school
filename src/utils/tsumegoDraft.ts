import type { Problem } from '../types/problem';

/**
 * 詰碁の中断データ（下書き）。
 *
 * 生徒が取組中に先生が検討や対局を始めると画面が切り替わる（授業の主導は先生側）。
 * その際、未クリアの問題と進捗（問題番号・正解数・失敗数）をここへ退避し、
 * ロビーに戻ったときや次回出題時に同じ場所から再開できるようにする。
 */

const KEY_PREFIX = 'go-school-tsumego-draft';

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
    return {
      problem: parsed.problem,
      progress: {
        problemNo: parsed.progress.problemNo,
        solved: parsed.progress.solved ?? 0,
        failed: parsed.progress.failed ?? 0,
      },
      savedAt: parsed.savedAt ?? 0,
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
