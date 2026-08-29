import { describe, expect, it } from 'vitest';
import { setStudentAudioPermission } from './audioPermissions';

describe('setStudentAudioPermission', () => {
  it('Mクリアは参加中の全生徒のマイクだけをOFFにする', () => {
    const result = setStudentAudioPermission(
      {
        a: { canHear: false, micAllowed: true, cameraAllowed: false },
        offline: { canHear: true, micAllowed: true, cameraAllowed: true },
      },
      ['a', 'b'],
      { micAllowed: false },
    );

    expect(result.a).toEqual({ canHear: false, micAllowed: false, cameraAllowed: false });
    expect(result.b).toEqual({ canHear: true, micAllowed: false, cameraAllowed: true });
    expect(result.offline.micAllowed).toBe(true);
  });

  it('Sクリアは参加中の全生徒の講師音声受信だけをOFFにする', () => {
    const result = setStudentAudioPermission(
      { a: { canHear: true, micAllowed: false, cameraAllowed: false } },
      ['a'],
      { canHear: false },
    );

    expect(result.a).toEqual({ canHear: false, micAllowed: false, cameraAllowed: false });
  });
});
