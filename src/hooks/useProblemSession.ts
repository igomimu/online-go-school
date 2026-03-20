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

    // Check if this move matches any correct answer in the SGF tree
    const matchingChild = currentSgfNode.children.find(child => {
      if (!child.move) return false;
      return child.move.x === x && child.move.y === y && child.move.color === color;
    });

    if (matchingChild) {
      // Correct move!
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

      // There's a response move (opponent's response)
      const responseNode = matchingChild.children[0]; // Take main line response
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
    } else {
      // Wrong move
      const newState: ProblemState = {
        ...state,
        boardState: capturedBoard,
        status: 'incorrect',
        movesMade: newMoves,
        message: '不正解',
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
