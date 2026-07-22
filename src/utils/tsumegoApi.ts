import { getSupabase } from './liveGameApi';

// tsumego_problems.answer_tree の1ノード。座標はSGF形式(2文字, 0-indexed相当)。
// dojo-app(スマ詰め機能)の src/lib/tsumego/types.ts の MoveNode と同一構造。
export interface AnswerTreeNode {
  coord: string; // "" for root
  color: 'B' | 'W' | '';
  children: AnswerTreeNode[];
  isCorrect?: boolean;
  isWrong?: boolean;
}

export interface TsumegoProblemRow {
  id: string;
  source_id: number;
  board_size: number;
  black_first: boolean;
  level: string;
  problem_type: string;
  book_info: string | null;
  initial_black: string[];
  initial_white: string[];
  answer_tree: AnswerTreeNode;
  view_range: { x1: number; y1: number; x2: number; y2: number };
  status: 'unverified' | 'verified' | 'broken';
}

export interface TsumegoFilter {
  level?: string;
  boardSize?: number;
}

const TSUMEGO_SELECT = 'id, source_id, board_size, black_first, level, problem_type, book_info, initial_black, initial_white, answer_tree, view_range, status';

/** 条件に合う詰碁の件数を取得する。 */
export async function countTsumegoProblems(filter: TsumegoFilter = {}): Promise<number> {
  const supabase = getSupabase();
  let query = supabase
    .from('tsumego_problems')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'verified')
    .neq('problem_type', 'ヨセ')
    .not('answer_tree->children', 'eq', '[]');
  // レベルは"10K"のような基本表記と"10K+"(やや難)の両方を含める(dojo-appのfetchAngyouProblemsと同じ扱い)。
  if (filter.level) query = query.or(`level.eq.${filter.level},level.eq.${filter.level}+`);
  if (filter.boardSize) query = query.eq('board_size', filter.boardSize);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * 条件に合う詰碁からランダムに1問取得する。
 * ORDER BY random() は使わず、件数取得→ランダムoffsetで1件rangeする方式。
 */
export async function fetchRandomTsumegoProblem(filter: TsumegoFilter = {}): Promise<TsumegoProblemRow | null> {
  const total = await countTsumegoProblems(filter);
  if (total === 0) return null;

  const supabase = getSupabase();
  const offset = Math.floor(Math.random() * total);
  let query = supabase
    .from('tsumego_problems')
    .select(TSUMEGO_SELECT)
    .eq('status', 'verified')
    .neq('problem_type', 'ヨセ')
    .not('answer_tree->children', 'eq', '[]');
  if (filter.level) query = query.or(`level.eq.${filter.level},level.eq.${filter.level}+`);
  if (filter.boardSize) query = query.eq('board_size', filter.boardSize);

  const { data, error } = await query.range(offset, offset);
  if (error) throw error;
  const row = data?.[0];
  return row ? (row as unknown as TsumegoProblemRow) : null;
}

/**
 * 詰碁問題のまちがいを報告する。tsumego_reports へINSERTするだけで、
 * 通知(dojo@1kawa15.comへのメール)は既存のDBトリガー(notify-tsumego-report
 * Edge Function、dojo-appと共有)が自動で行う。
 */
export async function reportTsumegoProblem(params: {
  problemId: string;
  sourceId: number;
  reason: string;
}): Promise<void> {
  const supabase = getSupabase();
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from('tsumego_reports').insert({
    problem_id: params.problemId,
    source_id: params.sourceId,
    reporter_id: userData.user?.id ?? null,
    reason: params.reason.trim() || null,
  });
  if (error) throw error;
}
