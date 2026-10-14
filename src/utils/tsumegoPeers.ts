// 詰碁出題中に、一緒に解いている仲間の様子を生徒にも見せる（2026-10-14 三村さん）。
// 下の名前に正解数を添え、速く進んでいる子は炎、つまずいている子は氷で包む。
// 生徒どうしは直接やり取りしないので、講師の端末が集めた結果からまとめて配る。

import type { ProblemResultView } from '../types/problem';

/** 炎＝3問続けて正解 / 氷＝同じ問題で2回以上まちがえ */
export type PeerMood = 'fire' | 'ice' | null;

export const FIRE_STREAK = 3;
export const ICE_MISSES = 2;

export interface TsumegoPeer {
  identity: string;
  name: string;
  solved: number;
  mood: PeerMood;
}

export interface TsumegoPeersPayload {
  peers: TsumegoPeer[];
}

/**
 * 続けて正解した数。正解で1増え、まちがい・時間切れで0に戻る。
 * result が null（次の問題を解き始めた知らせ）のときは変えない。
 */
export function nextStreak(previous: number | undefined, result: ProblemResultView['result']): number {
  if (result === 'correct') return (previous ?? 0) + 1;
  if (result === 'incorrect') return 0;
  return previous ?? 0;
}

export function peerMood(view: Pick<ProblemResultView, 'result' | 'attempt' | 'streak'>): PeerMood {
  if (view.result === 'incorrect' && (view.attempt ?? 0) >= ICE_MISSES) return 'ice';
  if ((view.streak ?? 0) >= FIRE_STREAK) return 'fire';
  return null;
}

/** 「遠藤 瑠以」→「瑠以」（全角の空白でも区切る）。区切りが無ければそのまま */
export function givenName(fullName: string): string {
  const parts = fullName.trim().split(/[\s\u3000]+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : fullName.trim();
}

/**
 * 講師の集計から、生徒へ配る一覧を作る。
 * 並びは生徒IDの順で固定する。正解数の順にすると順位表になり、毎問ならび替わって目が追えない。
 */
export function buildTsumegoPeers(
  results: Record<string, ProblemResultView>,
  nameOf: (identity: string) => string,
): TsumegoPeer[] {
  return Object.entries(results)
    .map(([identity, view]) => ({
      identity,
      name: givenName(nameOf(identity)),
      solved: view.solved ?? 0,
      mood: peerMood(view),
    }))
    .sort((a, b) => a.identity.localeCompare(b.identity));
}
