import type { TsumegoRatingState } from '../types/tsumegoRating';
import { getSupabase } from './liveGameApi';
import { isTsumegoRatingState } from './tsumegoRating';

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

function rowToState(row: TsumegoRatingRow): TsumegoRatingState | null {
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

export async function loadTsumegoRatingFromServer(studentId: string): Promise<TsumegoRatingState | null> {
  const { data, error } = await getSupabase()
    .from('go_school_tsumego_ratings')
    .select('student_login_id,rank_id,points,consecutive_wins,protection_count,total_solved,total_attempts,highest_rank_id,last_updated')
    .eq('student_login_id', studentId)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToState(data as TsumegoRatingRow) : null;
}

let saveQueue: Promise<void> = Promise.resolve();

export function saveTsumegoRatingToServer(
  state: TsumegoRatingState,
  studentId: string,
): Promise<void> {
  const row: TsumegoRatingRow = {
    student_login_id: studentId,
    rank_id: state.rankId,
    points: state.points,
    consecutive_wins: state.consecutiveWins,
    protection_count: state.protectionCount,
    total_solved: state.totalSolved,
    total_attempts: state.totalAttempts,
    highest_rank_id: state.highestRankId,
    last_updated: state.lastUpdated,
  };
  const save = async () => {
    const { error } = await getSupabase()
      .from('go_school_tsumego_ratings')
      .upsert(row, { onConflict: 'student_login_id' });
    if (error) throw error;
  };
  const queued = saveQueue.catch(() => {}).then(save);
  saveQueue = queued;
  return queued;
}
