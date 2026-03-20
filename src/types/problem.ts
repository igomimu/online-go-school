import type { BoardState, StoneColor } from '../components/GoBoard';
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
