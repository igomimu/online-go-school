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

export interface ProblemResultPayload {
  problemId: string;
  result: 'correct' | 'incorrect';
  moveCount: number;
  attempt?: number;            // 何回目の挑戦か（1始まり）
  livesLeft?: number | null;   // 残りライフ（null=無制限）
  problemNo?: number;          // 出題から数えて何問目か
  solved?: number;             // 解けた問題数
  failed?: number;             // ライフが尽きた問題数
}

/** 先生のモニターが生徒ごとに覚えておく最新の状況 */
export type ProblemResultView = Omit<ProblemResultPayload, 'problemId'>;
