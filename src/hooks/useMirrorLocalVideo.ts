import { useEffect, useState } from 'react';
import { MIRROR_EVENT, getMirrorLocalVideo } from '../utils/mediaDevices';

/**
 * 自分の映像を左右反転して見るかどうか。
 * 設定ダイアログで切り替えた瞬間に、開いている映像タイルへ反映させる。
 * 別ウィンドウ（検討窓など）でも揃うよう storage イベントも拾う。
 */
export function useMirrorLocalVideo(): boolean {
  const [mirror, setMirror] = useState(getMirrorLocalVideo);

  useEffect(() => {
    const sync = () => setMirror(getMirrorLocalVideo());
    window.addEventListener(MIRROR_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(MIRROR_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return mirror;
}
