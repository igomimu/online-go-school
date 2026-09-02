export interface RealtimeIdentityPeer {
  id: string;
  customParticipantId?: string;
}

/**
 * 同じ生徒identityで複数接続しているpeerのうち、切断する古い接続を選ぶ。
 * participantJoined直後はpreferredPeerId（新しい接続）を残し、初回同期時は
 * joined Mapの末尾（最後に追加された接続）を残す。先生の複数窓は意図的なので除外する。
 */
export function selectDuplicateStudentPeersToKick<T extends RealtimeIdentityPeer>(
  peers: T[],
  preferredPeerId?: string,
): T[] {
  const groups = new Map<string, T[]>();
  peers.forEach((peer) => {
    const identity = peer.customParticipantId;
    if (!identity || identity.replace(/^sid:/, '') === 'teacher') return;
    const group = groups.get(identity) ?? [];
    group.push(peer);
    groups.set(identity, group);
  });

  const toKick: T[] = [];
  groups.forEach((group) => {
    if (group.length < 2) return;
    const keep = group.find(peer => peer.id === preferredPeerId) ?? group[group.length - 1];
    group.forEach((peer) => {
      if (peer.id !== keep.id) toKick.push(peer);
    });
  });
  return toKick;
}
