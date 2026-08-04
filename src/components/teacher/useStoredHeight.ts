import { useCallback, useState } from 'react';

/**
 * つまんで変えた高さを端末ごとに覚える。
 *
 * 既定は null＝「中身なりの高さ（上限つき）」。触っていないうちは今までの見え方を
 * 変えないためで、生徒が2人しかいない教室で一覧が場所を余らせることもない。
 * 一度でもつまんだら、その高さを覚えて固定する。
 */
export function useStoredHeight(key: string, min: number, max: number) {
  const storageKey = `ogs.height.${key}`;
  const [height, setHeight] = useState<number | null>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === null) return null;
      const n = Number(saved);
      if (Number.isFinite(n)) return Math.min(Math.max(n, min), max);
    } catch {
      // 読めなくても既定（中身なり）で動く
    }
    return null;
  });

  const commit = useCallback((value: number) => {
    setHeight(Math.min(Math.max(value, min), max));
  }, [min, max]);

  const save = useCallback((value: number) => {
    try {
      localStorage.setItem(storageKey, String(Math.round(Math.min(Math.max(value, min), max))));
    } catch {
      // 覚えられなくても、今の表示は変わっている
    }
  }, [storageKey, min, max]);

  return { height, commit, save };
}
