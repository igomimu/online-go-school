import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingResumeGameId,
  getPendingResumeGameId,
  interruptGameOnUnload,
  PENDING_RESUME_KEY,
} from './unloadInterrupt';

vi.mock('./liveGameApi', () => ({
  functionsBaseUrl: () => 'https://example.test/functions/v1',
  getSupabase: vi.fn(),
}));

describe('ウィンドウを閉じた対局の復帰情報', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('ウィンドウ終了後も残る localStorage に対局IDを保存する', () => {
    interruptGameOnUnload('game-123');

    expect(localStorage.getItem(PENDING_RESUME_KEY)).toBe('game-123');
    expect(sessionStorage.getItem(PENDING_RESUME_KEY)).toBeNull();
    expect(getPendingResumeGameId()).toBe('game-123');
  });

  it('再開完了後に復帰情報を消せる', () => {
    localStorage.setItem(PENDING_RESUME_KEY, 'game-123');
    clearPendingResumeGameId();
    expect(getPendingResumeGameId()).toBeNull();
  });
});
