import type { BoardState, StoneColor, ViewRange } from '../components/GoBoard';
import type { SgfTreeNode } from '../utils/sgfUtils';

export interface Problem {
  id: string;
  title: string;
  boardSize: number;
  initialBoard: BoardState;    // Setup position
  correctColor: StoneColor;    // Who plays first (the solver)
  sgfTree: SgfTreeNode;        // Solution tree
  difficulty?: string;         // 初級/中級/上級
  createdAt: string;           // ISO date
  viewRange?: ViewRange;       // 詰碁データベース由来: 部分盤面の表示範囲
  sourceId?: number;           // 詰碁データベース由来: tsumego_problems.source_id（まちがい報告用）
  lives?: number;              // 出題時に講師が決めたライフ（1〜5）。まちがえるたびに1減り0で終わり。未設定=無制限
  timeLimitSec?: number;       // 1問ごとの制限時間（秒）。切れたらその問題は失敗で次へ。未設定=なし
  ratingMode?: boolean;        // 格付け出題モード（生徒各自の格に応じた難易度が自動出題・昇降格）
}

export interface ProblemAttempt {
  problemId: string;
  studentIdentity: string;
  moves: { x: number; y: number; color: StoneColor }[];
  result: 'correct' | 'incorrect' | 'in_progress';
  timestamp: number;
}

export interface ProblemAssignPayload {
  problem: Problem;
  targetStudents: string[];    // Empty = all
}

/** 先生のモニターで「この生徒がいま解いている問題」を映すための最小限の中身（解答手順は含めない） */
export type ProblemPreview = Pick<Problem, 'id' | 'title' | 'boardSize' | 'initialBoard' | 'viewRange' | 'difficulty'>;

export interface ProblemResultPayload {
  problemId: string;
  /** null = 次の問題へ進んで挑戦中 */
  result: 'correct' | 'incorrect' | null;
  moveCount: number;
  attempt?: number;            // 何回目の挑戦か（1始まり）
  livesLeft?: number | null;   // 残りライフ（null=無制限）
  problemNo?: number;          // 出題から数えて何問目か
  solved?: number;             // 解けた問題数
  failed?: number;             // ライフが尽きた・時間切れの問題数
  timedOut?: boolean;          // この結果が時間切れによるものか
  current?: ProblemPreview;    // 問題が変わったときだけ付ける（生徒ごとに違う問題へ進むため）
  ratingRankId?: string;       // 詰碁格付けランクID（例: 'bronze_3'）
  ratingPoints?: number;       // 現在の勝ち点
}

/** 先生のモニターが生徒ごとに覚えておく最新の状況 */
export type ProblemResultView = Omit<ProblemResultPayload, 'problemId'>;
