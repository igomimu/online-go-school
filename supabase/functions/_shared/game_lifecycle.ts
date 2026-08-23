export const NEW_GAME_BLOCKING_STATUSES = ['playing', 'scoring'] as const

export function shouldCloseLiveGameWhenDeletingHistory(status: string | null | undefined): boolean {
  return status === 'interrupted'
}
