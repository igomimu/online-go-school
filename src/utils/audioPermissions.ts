import type { AudioPermissions } from '../types/game';

export const DEFAULT_AUDIO_PERMISSION = {
  canHear: true,
  micAllowed: true,
  cameraAllowed: true,
} as const;

export function audioPermissionFor(permissions: AudioPermissions, identity: string) {
  return permissions[identity] ?? DEFAULT_AUDIO_PERMISSION;
}

/** 参加中の生徒だけを対象に、MまたはSを一括変更する。 */
export function setStudentAudioPermission(
  permissions: AudioPermissions,
  identities: string[],
  patch: Partial<AudioPermissions[string]>,
): AudioPermissions {
  const next = { ...permissions };
  identities.forEach(identity => {
    next[identity] = { ...audioPermissionFor(permissions, identity), ...patch };
  });
  return next;
}

/**
 * 「この生徒の声が聞こえるか」は、講師が最後に押した記録ではなく生徒のマイクの実際で決める。
 * 生徒は自分でもマイクを入れたり切ったりするので、記録だけを見ると表示が実際とずれ、
 * 押したときに逆の操作になる。在室していない生徒は記録のまま。
 */
export function withActualMicState(
  permissions: AudioPermissions,
  participants: ReadonlyArray<{ identity: string; audioEnabled: boolean }>,
): AudioPermissions {
  const next = { ...permissions };
  participants.forEach(({ identity, audioEnabled }) => {
    next[identity] = { ...audioPermissionFor(permissions, identity), micAllowed: audioEnabled };
  });
  return next;
}
