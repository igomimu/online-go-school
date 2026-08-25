import type { ViewMode } from '../types/game';
import type { Role } from './classroomRtc';

/**
 * 生徒に同期碁盤がある時は通常授業を自動表示するが、先生が明示的に開始した
 * 検討・詰碁・対局の画面を上書きしない。
 */
export function resolveEffectiveViewMode(
  role: Role | null,
  viewMode: ViewMode,
  hasSyncedNode: boolean,
): ViewMode {
  if (role === 'STUDENT' && hasSyncedNode && (viewMode === 'lobby' || viewMode === 'lecture')) {
    return 'lecture';
  }
  return viewMode;
}
