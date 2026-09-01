import type { AudioPermissions } from '../types/game';

const STORAGE_PREFIX = 'go-school-teacher-audio-permissions:';

function isPermission(value: unknown): value is AudioPermissions[string] {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.canHear === 'boolean'
    && typeof candidate.micAllowed === 'boolean'
    && typeof candidate.cameraAllowed === 'boolean';
}

/** 教室ごとの生徒別音声設定。講師の再読込・再接続後も同じ状態を戻す。 */
export function loadTeacherAudioPermissions(classroomId: string): AudioPermissions {
  if (!classroomId) return {};
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${classroomId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const permissions: AudioPermissions = {};
    Object.entries(parsed).forEach(([identity, value]) => {
      if (isPermission(value)) permissions[identity] = value;
    });
    return permissions;
  } catch {
    return {};
  }
}

export function saveTeacherAudioPermissions(classroomId: string, permissions: AudioPermissions): void {
  if (!classroomId) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${classroomId}`, JSON.stringify(permissions));
  } catch {
    // 保存容量不足やプライベートモードでも、授業中の操作自体は続ける。
  }
}
