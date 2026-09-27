import type { TsumegoRatingState } from '../types/tsumegoRating';
import { getSupabase } from './liveGameApi';
import { isTsumegoRatingState } from './tsumegoRating';

// 詰碁格付けの正本はアカウント（go_school_tsumego_ratings）。
// 格の計算はサーバーの関数が行い、生徒の端末は結果（正解/不正解）だけを送る（2026-09-27）。
// 端末の localStorage は、表示を早く出すためとオフライン時のためのキャッシュ。

interface TsumegoRatingRow {
  student_login_id: string;
  rank_id: string;
  points: number;
  consecutive_wins: number;
  protection_count: number;
  total_solved: number;
  total_attempts: number;
  highest_rank_id: string;
  last_updated: string;
}

export function rowToState(row: TsumegoRatingRow | null | undefined): TsumegoRatingState | null {
  if (!row || !row.rank_id) return null;
  const state = {
    rankId: row.rank_id,
    points: row.points,
    consecutiveWins: row.consecutive_wins,
    protectionCount: row.protection_count,
    totalSolved: row.total_solved,
    totalAttempts: row.total_attempts,
    highestRankId: row.highest_rank_id,
    lastUpdated: row.last_updated,
  };
  return isTsumegoRatingState(state) ? state : null;
}

/** アカウントの格付け。まだ決めていなければ null */
export async function loadTsumegoRatingFromServer(studentId: string): Promise<TsumegoRatingState | null> {
  const { data, error } = await getSupabase()
    .from('go_school_tsumego_ratings')
    .select('student_login_id,rank_id,points,consecutive_wins,protection_count,total_solved,total_attempts,highest_rank_id,last_updated')
    .eq('student_login_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return rowToState(data as TsumegoRatingRow | null);
}

function expectState(data: unknown): TsumegoRatingState {
  const state = rowToState(data as TsumegoRatingRow | null);
  if (!state) throw new Error('tsumego rating: unexpected response from server');
  return state;
}

/**
 * 初期格を決める。すでにアカウントに格があれば、それを変えずに返す
 * （別の端末で決めた格を、新しい端末の初期選択で上書きしない）。
 */
export async function startTsumegoRatingOnServer(rankId: string): Promise<TsumegoRatingState> {
  const { data, error } = await getSupabase().rpc('go_school_tsumego_start', { p_rank_id: rankId });
  if (error) throw error;
  return expectState(data);
}

// 結果は解いた順にサーバーへ届ける（前の送信の成否に関わらず、次を送る）
let recordQueue: Promise<unknown> = Promise.resolve();

/** 1問ぶんの結果を送り、サーバーが計算した最新の格付けを受け取る */
export function recordTsumegoResultOnServer(isCorrect: boolean): Promise<TsumegoRatingState> {
  const record = async () => {
    const { data, error } = await getSupabase().rpc('go_school_tsumego_record', { p_is_correct: isCorrect });
    if (error) throw error;
    return expectState(data);
  };
  const queued = recordQueue.catch(() => {}).then(record);
  recordQueue = queued;
  return queued;
}

/** 講師用: 生徒の格付けを消す（生徒は次の格付け出題で初期格を選び直す） */
export async function resetTsumegoRatingOnServer(studentLoginId: string): Promise<void> {
  const { error } = await getSupabase().rpc('go_school_tsumego_reset', { p_login_id: studentLoginId });
  if (error) throw error;
}
