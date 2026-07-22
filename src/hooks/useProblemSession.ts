import { useState, useCallback, useRef } from 'react';
import type { Problem, ProblemAttempt } from '../types/problem';
import type { BoardState, StoneColor } from '../components/GoBoard';
import type { SgfTreeNode } from '../utils/sgfUtils';
import { checkCapture, isLegalMove } from '../utils/gameLogic';

type ProblemStatus = 'waiting' | 'solving' | 'correct' | 'incorrect';

interface ProblemState {
  problem: Problem;
  boardState: BoardState;
  status: ProblemStatus;
  currentSgfNode: SgfTreeNode;  // Track position in solution tree
  movesMade: { x: number; y: number; color: StoneColor }[];
  message: string;
}

// 応手候補が複数ある場合、途中で手順が切れないよう「続きが最も深い」枝を優先して見せる。
// (詰碁データベース由来のanswer_treeは相手の応手が複数記録されていることがある)
function getNodeDepth(node: SgfTreeNode): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(getNodeDepth));
}

function getPreferredResponseNode(node: SgfTreeNode): SgfTreeNode | undefined {
  if (node.children.length === 0) return undefined;
  return node.children.reduce((best, current) =>
    getNodeDepth(current) > getNodeDepth(best) ? current : best
  );
}

export function useProblemSession() {
  const [problemState, setProblemState] = useState<ProblemState | null>(null);
  const [attempts, setAttempts] = useState<ProblemAttempt[]>([]);
  const stateRef = useRef<ProblemState | null>(null);

  const startProblem = useCallback((problem: Problem) => {
    const state: ProblemState = {
      problem,
      boardState: problem.initialBoard.map(row => row.map(cell => cell ? { ...cell } : null)),
      status: 'solving',
      currentSgfNode: problem.sgfTree,
      movesMade: [],
      message: `${problem.correctColor === 'BLACK' ? '黒' : '白'}番です`,
    };
    stateRef.current = state;
    setProblemState(state);
  }, []);

  const makeMove = useCallback((x: number, y: number) => {
    const state = stateRef.current;
    if (!state || state.status !== 'solving') return;

    const { problem, boardState, currentSgfNode } = state;
    const color = problem.correctColor;
    const size = problem.boardSize;

    // Check if move is legal
    if (!isLegalMove(boardState, x, y, color, size)) return;

    // Place stone
    const newBoard = boardState.map(row => row.map(cell => cell ? { ...cell } : null));
    newBoard[y - 1][x - 1] = { color };
    const { board: capturedBoard } = checkCapture(newBoard, x, y, color, size);

    const newMoves = [...state.movesMade, { x, y, color }];

    // Check if this move matches any known answer in the SGF tree
    const matchingChild = currentSgfNode.children.find(child => {
      if (!child.move) return false;
      return child.move.x === x && child.move.y === y && child.move.color === color;
    });

    if (!matchingChild) {
      // Wrong move (手順に無い手)
      const newState: ProblemState = {
        ...state,
        boardState: capturedBoard,
        status: 'incorrect',
        movesMade: newMoves,
        message: '不正解',
      };
      stateRef.current = newState;
      setProblemState(newState);
      return;
    }

    // 不正解手（isWrong）。ただしisCorrectも同時に立っている場合は
    // 「正解パス上の手だが不正解扱い」という矛盾データなので、isCorrectを優先する
    // （詰碁データベース由来のanswer_treeにこの矛盾ケースが実際に存在する）。
    if (matchingChild.isWrong && !matchingChild.isCorrect) {
      const newState: ProblemState = {
        ...state,
        boardState: capturedBoard,
        status: 'incorrect',
        currentSgfNode: matchingChild,
        movesMade: newMoves,
        message: '不正解',
      };
      stateRef.current = newState;
      setProblemState(newState);
      return;
    }

    if (matchingChild.children.length === 0) {
      // Problem solved! (no more moves = end of solution)
      const newState: ProblemState = {
        ...state,
        boardState: capturedBoard,
        status: 'correct',
        currentSgfNode: matchingChild,
        movesMade: newMoves,
        message: '正解！',
      };
      stateRef.current = newState;
      setProblemState(newState);
      return;
    }

    // There's a response move (opponent's response). 応手候補が複数ある場合は
    // 最も深い枝(=手順の続きがある枝)を優先する。
    const responseNode = getPreferredResponseNode(matchingChild)!;
    if (responseNode.move) {
      const rx = responseNode.move.x;
      const ry = responseNode.move.y;
      const rColor = responseNode.move.color;
      // Place response
      capturedBoard[ry - 1][rx - 1] = { color: rColor };
      const { board: responseBoard } = checkCapture(capturedBoard, rx, ry, rColor, size);
      newMoves.push({ x: rx, y: ry, color: rColor });

      if (responseNode.children.length === 0) {
        // Problem solved after response!
        const newState: ProblemState = {
          ...state,
          boardState: responseBoard,
          status: 'correct',
          currentSgfNode: responseNode,
          movesMade: newMoves,
          message: '正解！',
        };
        stateRef.current = newState;
        setProblemState(newState);
        return;
      }

      // Continue solving
      const newState: ProblemState = {
        ...state,
        boardState: responseBoard,
        status: 'solving',
        currentSgfNode: responseNode,
        movesMade: newMoves,
        message: '続けてください',
      };
      stateRef.current = newState;
      setProblemState(newState);
    } else {
      // No response move but has children - keep going
      const newState: ProblemState = {
        ...state,
        boardState: capturedBoard,
        status: 'correct',
        currentSgfNode: matchingChild,
        movesMade: newMoves,
        message: '正解！',
      };
      stateRef.current = newState;
      setProblemState(newState);
    }
  }, []);

  const retry = useCallback(() => {
    if (!stateRef.current) return;
    startProblem(stateRef.current.problem);
  }, [startProblem]);

  const closeProblem = useCallback(() => {
    stateRef.current = null;
    setProblemState(null);
  }, []);

  const recordAttempt = useCallback((identity: string) => {
    if (!stateRef.current) return;
    const state = stateRef.current;
    const attempt: ProblemAttempt = {
      problemId: state.problem.id,
      studentIdentity: identity,
      moves: state.movesMade,
      result: state.status === 'correct' ? 'correct' : state.status === 'incorrect' ? 'incorrect' : 'in_progress',
      timestamp: Date.now(),
    };
    setAttempts(prev => [...prev, attempt]);
    return attempt;
  }, []);

  return {
    problemState,
    attempts,
    startProblem,
    makeMove,
    retry,
    closeProblem,
    recordAttempt,
  };
}
