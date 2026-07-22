import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useProblemSession } from './useProblemSession';
import type { Problem } from '../types/problem';
import type { SgfTreeNode } from '../utils/sgfUtils';
import { createEmptyBoard } from '../utils/gameLogic';

function makeProblem(sgfTree: SgfTreeNode, boardSize = 9): Problem {
  return {
    id: 'test-problem',
    title: 'test',
    boardSize,
    initialBoard: createEmptyBoard(boardSize),
    correctColor: 'BLACK',
    sgfTree,
    createdAt: new Date().toISOString(),
  };
}

describe('useProblemSession', () => {
  it('手順に無い手を打つと不正解になる', () => {
    const sgfTree: SgfTreeNode = {
      children: [{ move: { x: 1, y: 1, color: 'BLACK' }, isCorrect: true, children: [] }],
    };
    const { result } = renderHook(() => useProblemSession());
    act(() => result.current.startProblem(makeProblem(sgfTree)));
    act(() => result.current.makeMove(5, 5));
    expect(result.current.problemState?.status).toBe('incorrect');
  });

  it('isWrongのみが付いた手を打つと即座に不正解になる（詰碁データベース由来のバグ修正の核心）', () => {
    const sgfTree: SgfTreeNode = {
      children: [
        { move: { x: 1, y: 1, color: 'BLACK' }, isCorrect: true, children: [] },
        { move: { x: 2, y: 2, color: 'BLACK' }, isWrong: true, children: [{ move: { x: 3, y: 3, color: 'WHITE' }, children: [] }] },
      ],
    };
    const { result } = renderHook(() => useProblemSession());
    act(() => result.current.startProblem(makeProblem(sgfTree)));
    act(() => result.current.makeMove(2, 2));
    expect(result.current.problemState?.status).toBe('incorrect');
  });

  it('isCorrectとisWrongが同時に付いたノードはcorrect優先で扱う（矛盾データのフォールバック）', () => {
    const sgfTree: SgfTreeNode = {
      children: [
        { move: { x: 1, y: 1, color: 'BLACK' }, isCorrect: true, isWrong: true, children: [] },
      ],
    };
    const { result } = renderHook(() => useProblemSession());
    act(() => result.current.startProblem(makeProblem(sgfTree)));
    act(() => result.current.makeMove(1, 1));
    expect(result.current.problemState?.status).toBe('correct');
  });

  it('葉ノードに到達すると正解になる', () => {
    const sgfTree: SgfTreeNode = {
      children: [{ move: { x: 1, y: 1, color: 'BLACK' }, isCorrect: true, children: [] }],
    };
    const { result } = renderHook(() => useProblemSession());
    act(() => result.current.startProblem(makeProblem(sgfTree)));
    act(() => result.current.makeMove(1, 1));
    expect(result.current.problemState?.status).toBe('correct');
  });

  it('応手候補が複数ある場合、最も深い枝を優先して選ぶ', () => {
    const shortResponse: SgfTreeNode = { move: { x: 4, y: 4, color: 'WHITE' }, children: [] };
    const deepResponse: SgfTreeNode = {
      move: { x: 5, y: 5, color: 'WHITE' },
      children: [{ move: { x: 6, y: 6, color: 'BLACK' }, isCorrect: true, children: [] }],
    };
    const sgfTree: SgfTreeNode = {
      children: [
        { move: { x: 1, y: 1, color: 'BLACK' }, isCorrect: true, children: [shortResponse, deepResponse] },
      ],
    };
    const { result } = renderHook(() => useProblemSession());
    act(() => result.current.startProblem(makeProblem(sgfTree)));
    act(() => result.current.makeMove(1, 1));
    // 応手適用後、solvingが継続し盤面には深い方の応手(5,5)が置かれる
    expect(result.current.problemState?.status).toBe('solving');
    expect(result.current.problemState?.boardState[4][4]).toEqual({ color: 'WHITE' });
    expect(result.current.problemState?.boardState[3][3]).toBeNull();
  });
});
