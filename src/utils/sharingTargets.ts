/**
 * 検討の参加者（配信先）の選び方。
 *
 * `null` は「全員」、配列は「そこに挙がっている生徒だけ」。空配列は「誰にも配信しない」
 * （講師が一人で棋譜を見たいとき）。空配列を「全員」の意味に使うと、生徒を一人ずつ
 * 外していって最後の一人を外した瞬間に全員へ配信される、という逆の挙動になる。
 *
 * 教室ホームの生徒一覧の「共有」列と、検討画面の「配信先の生徒」の両方がここを通る
 * （別々に書くとずれるため）。対局中の生徒に検討を見せると対局の邪魔になるので、
 * 講師が参加者を選べる必要がある（2026-08-05 三村さん）。
 */
export type SharingTargets = string[] | null;

export function toggleSharingTarget(
  targets: SharingTargets,
  identity: string,
  allIdentities: string[],
): SharingTargets {
  // 全員の状態から一人外す: いったん全員を並べてからその人を抜く
  if (targets === null) {
    return allIdentities.filter(id => id !== identity);
  }
  if (targets.includes(identity)) {
    return targets.filter(id => id !== identity);
  }
  const next = [...targets, identity];
  // 結果として全員そろったら「全員」に畳む
  const everyone = allIdentities.length > 0 && allIdentities.every(id => next.includes(id));
  return everyone ? null : next;
}

/** その生徒に配信されるか */
export function isSharingTarget(targets: SharingTargets, identity: string): boolean {
  return targets === null || targets.includes(identity);
}

/** 配信先を更新したとき、途中参加・途中退出させる生徒を求める */
export function getSharingTargetChanges(
  previous: SharingTargets,
  next: SharingTargets,
  allIdentities: string[],
): { added: string[]; removed: string[] } {
  return {
    added: allIdentities.filter(
      identity => !isSharingTarget(previous, identity) && isSharingTarget(next, identity),
    ),
    removed: allIdentities.filter(
      identity => isSharingTarget(previous, identity) && !isSharingTarget(next, identity),
    ),
  };
}
