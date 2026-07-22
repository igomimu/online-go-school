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
}
