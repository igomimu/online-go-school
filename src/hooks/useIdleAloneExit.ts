import { useEffect, useRef } from 'react';

/** 一人きりのまま無操作が続いたときに教室から出るまでの時間 */
export const IDLE_ALONE_TIMEOUT_MS = 15 * 60 * 1000;

/** 経過を見に行く間隔。背景タブでは 1 分程度まで間引かれるので、それより粗くしない */
const CHECK_INTERVAL_MS = 30 * 1000;

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;

type Options = {
  /** 「接続中」かつ「自分以外が誰も居ない」ときだけ true にする */
  active: boolean;
  onIdle: () => void;
  timeoutMs?: number;
};

/**
 * 誰も居ない教室に繋ぎっぱなしのまま放置された端末を、自分から切る。
 *
 * LiveKit の参加者分は「繋いでいた時間」で数えられるので、開いたままのタブ 1 枚が
 * 1 日 1,440 分を食う。閉じたときは disconnectOnPageLeave が効くが、開けっぱなしには効かない。
 *
 * 授業中に切ってしまわないよう、条件は二つ重ねる:
 *  - 自分以外が居ない（授業なら必ず 2 人以上いる）
 *  - 自分が何も触っていない（講義を黙って見ている生徒を巻き込まない）
 */
export function useIdleAloneExit({ active, onIdle, timeoutMs = IDLE_ALONE_TIMEOUT_MS }: Options): void {
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!active) return;

    let lastActivity = Date.now();
    const bump = () => {
      lastActivity = Date.now();
    };
    ACTIVITY_EVENTS.forEach(name => window.addEventListener(name, bump, { passive: true }));

    // setTimeout は背景タブで大きく間引かれるため、経過時間そのものを見る
    const timer = setInterval(() => {
      if (Date.now() - lastActivity >= timeoutMs) onIdleRef.current();
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach(name => window.removeEventListener(name, bump));
    };
  }, [active, timeoutMs]);
}
