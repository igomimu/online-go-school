import { describe, it, expect } from 'vitest';
import { shouldAutoReload, type AppUpdateSituation } from './appUpdatePolicy';

const base: AppUpdateSituation = {
  updateAvailable: true,
  isConnected: false,
  hasUnsavedWork: false,
  alreadyReloaded: false,
};

describe('新しい版を自動で取り込んでよいか', () => {
  it('教室に入っていない端末は自動で読み込み直す', () => {
    expect(shouldAutoReload(base)).toBe(true);
  });

  it('🔴 授業中（教室に接続中）は読み込み直さない', () => {
    // 2026-09-07、授業中の配信で生徒2人の接続がその場で切れた
    expect(shouldAutoReload({ ...base, isConnected: true })).toBe(false);
  });

  it('棋譜作成の入力を抱えている間は読み込み直さない', () => {
    expect(shouldAutoReload({ ...base, hasUnsavedWork: true })).toBe(false);
  });

  it('版がずれていなければ何もしない', () => {
    expect(shouldAutoReload({ ...base, updateAvailable: false })).toBe(false);
  });

  it('一度自動で読み込み直したら繰り返さない（読み込みの無限ループを防ぐ）', () => {
    expect(shouldAutoReload({ ...base, alreadyReloaded: true })).toBe(false);
  });
});
