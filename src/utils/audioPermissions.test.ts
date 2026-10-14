import { describe, expect, it } from 'vitest';
import { setStudentAudioPermission, withActualMicState } from './audioPermissions';

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

describe('withActualMicState', () => {
  it('在室している生徒のマイクは、講師の記録ではなく実際の状態で出す', () => {
    const recorded = { 'sid:1': { canHear: false, micAllowed: false, cameraAllowed: true } };
    const shown = withActualMicState(recorded, [{ identity: 'sid:1', audioEnabled: true }]);
    expect(shown['sid:1']).toEqual({ canHear: false, micAllowed: true, cameraAllowed: true });
  });

  it('在室していない生徒は記録のまま', () => {
    const recorded = { 'sid:2': { canHear: true, micAllowed: false, cameraAllowed: true } };
    expect(withActualMicState(recorded, [])).toEqual(recorded);
  });
});
