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
