import { useEffect, useState } from 'react';

// visualViewport.scale は未ズーム時1.0。ブラウザの丸め誤差を吸収しつつ
// 「意図的にピンチアウトした」と判定できる閾値。
const ZOOM_THRESHOLD = 1.15;

function getScale(): number {
  return typeof window !== 'undefined' ? (window.visualViewport?.scale ?? 1) : 1;
}

/**
 * ブラウザのネイティブピンチズームで碁盤を拡大表示中か判定する（visualViewport.scale基準）。
 * ユーザーが既に手動で拡大している間は、アプリ側の自動拡大(ZoomTapConfirm)と
 * 二重に拡大せず1タップでそのまま着手できるようにするために使う。
 */
export function useIsPinchZoomed(): boolean {
  const [zoomed, setZoomed] = useState(() => getScale() > ZOOM_THRESHOLD);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const handler = () => setZoomed(vv.scale > ZOOM_THRESHOLD);
    vv.addEventListener('resize', handler);
    vv.addEventListener('scroll', handler);
    return () => {
      vv.removeEventListener('resize', handler);
      vv.removeEventListener('scroll', handler);
    };
  }, []);

  return zoomed;
}
