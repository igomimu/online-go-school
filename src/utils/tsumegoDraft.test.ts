import { describe, it, expect, beforeEach } from 'vitest';
import { saveTsumegoDraft, loadTsumegoDraft, clearTsumegoDraft, TSUMEGO_DRAFT_TTL_MS, type TsumegoDraft } from './tsumegoDraft';
import type { Problem } from '../types/problem';

describe('tsumegoDraft', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const mockProblem: Problem = {
    id: 'prob-1',
    title: '基本詰碁',
    boardSize: 19,
    initialBoard: [],
    correctColor: 'BLACK',
    sgfTree: { children: [] },
    createdAt: new Date().toISOString(),
  };

  it('下書きを保存して正しく読み出せる', () => {
    const draft: TsumegoDraft = {
      problem: mockProblem,
      progress: { problemNo: 3, solved: 2, failed: 0 },
      savedAt: Date.now(),
    };
    saveTsumegoDraft(draft);
    const loaded = loadTsumegoDraft();
    expect(loaded).toEqual(draft);
  });

  it('scopeごとに独立して保存できる', () => {
    const draft1: TsumegoDraft = {
      problem: { ...mockProblem, id: 'prob-user1' },
      progress: { problemNo: 1, solved: 0, failed: 0 },
      savedAt: Date.now(),
    };
    const draft2: TsumegoDraft = {
      problem: { ...mockProblem, id: 'prob-user2' },
      progress: { problemNo: 5, solved: 4, failed: 0 },
      savedAt: Date.now() + 1,
    };
    saveTsumegoDraft(draft1, 'user-1');
    saveTsumegoDraft(draft2, 'user-2');

    expect(loadTsumegoDraft('user-1')?.problem.id).toBe('prob-user1');
    expect(loadTsumegoDraft('user-2')?.problem.id).toBe('prob-user2');
  });

  it('クリアした後はnullが返る', () => {
    saveTsumegoDraft({
      problem: mockProblem,
      progress: { problemNo: 1, solved: 0, failed: 0 },
      savedAt: Date.now(),
    }, 'user-1');
    clearTsumegoDraft('user-1');
    expect(loadTsumegoDraft('user-1')).toBeNull();
  });

  it('不正なデータの場合はnullが返る', () => {
    localStorage.setItem('go-school-tsumego-draft', 'invalid-json');
    expect(loadTsumegoDraft()).toBeNull();
  });

  it('期限を過ぎた続きは出さず、消しておく', () => {
    saveTsumegoDraft({
      problem: mockProblem,
      progress: { problemNo: 2, solved: 1, failed: 0 },
      savedAt: Date.now() - TSUMEGO_DRAFT_TTL_MS - 1,
    }, 'user-1');
    expect(loadTsumegoDraft('user-1')).toBeNull();
    expect(localStorage.getItem('go-school-tsumego-draft_user-1')).toBeNull();
  });
});
