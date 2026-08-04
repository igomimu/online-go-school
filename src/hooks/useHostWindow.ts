import { createContext, useContext } from 'react';

/**
 * 中身が実際に描かれているウィンドウ。既定は本体。
 *
 * 検討を別ウィンドウに出す（PopupPortal）と、DOM は別ウィンドウにありながら
 * JS の文脈は本体のままになる。`window.addEventListener` を素で書くと本体側に
 * 張られてキーが効かないので、キー操作はこのフックが返すウィンドウに張る。
 */
export const HostWindowContext = createContext<Window>(
  typeof window !== 'undefined' ? window : ({} as Window),
);

export function useHostWindow(): Window {
  return useContext(HostWindowContext);
}
